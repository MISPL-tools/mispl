const fs = require("fs");
const path = require("path");

// Importeer de helper-functies uit je nieuwe utils.js bestand (dat in dezelfde 'engine' map staat)
const { isDefaultValue } = require("./utils");

// === GLIMS Dictionary inladen ===
// TypeChecker heeft dit nodig om te controleren of de GLIMS functies en tabellen kloppen
let GLIMS_DICT = { globals: {}, tables: {} };
try {
	// LET OP DE '..': We gaan één map omhoog vanuit 'engine' naar de hoofdmap, en dan naar 'features'
	const dictPath = path.join(__dirname, "..", "features", "glimsDictionary.json");
	if (fs.existsSync(dictPath)) {
		const rawData = fs.readFileSync(dictPath, "utf8");
		const cleanData = rawData.replace(/^\uFEFF/, '');
		GLIMS_DICT = JSON.parse(cleanData);
		if (!GLIMS_DICT.globals) GLIMS_DICT.globals = {};
		if (!GLIMS_DICT.tables) GLIMS_DICT.tables = {};
	} else {
		console.warn("TypeChecker: glimsDictionary.json niet gevonden op pad:", dictPath);
	}
} catch (e) {
	console.error("TypeChecker: Fout bij inlezen JSON:", e.message);
}

const ExpressionParser = {
	maskStrings(expr, stringMap) {
		let stringCounter = 0;
		return String(expr).replace(/"(?:[^"]|"")*(?:"|$)/g, (match) => {
			const key = `###STR${stringCounter++}###`;
			stringMap.set(key, match);
			return key;
		}).replace(/'(?:[^']|'')*(?:'|$)/g, (match) => {
			const key = `###STR${stringCounter++}###`;
			stringMap.set(key, match);
			return key;
		});
	},

	getReferenceRegex() {
		return /(?:[a-zA-Z_]\w*)?(?:\s*\.\s*[a-zA-Z_]\w*(?:\([^)]*\))?)+/g;
	},

	isPureReference(expr) {
		if (!expr) return false;
		const exactRegex = new RegExp(`^${this.getReferenceRegex().source}$`);
		return exactRegex.test(String(expr).trim());
	},

	extractReferences(expr, line, context) {
		if (!expr) return;
		const safeExpr = String(expr);
		const stringMap = new Map();
		const maskedExpr = this.maskStrings(safeExpr, stringMap);
		const referenceRegex = this.getReferenceRegex();

		let match;
		while ((match = referenceRegex.exec(maskedExpr)) !== null) {
			let fullReference = match[0];
			stringMap.forEach((val, key) => { fullReference = fullReference.replace(key, val); });
			const lookupKey = fullReference.replace(/\s+/g, "").toLowerCase();

			let foundAlias = false;

			if (context.aliases.has(lookupKey)) {
				context.addInfo(line, `💡 Optimalisatie: Je hebt '${fullReference}' al opgeslagen in klasse-variabele '${context.aliases.get(lookupKey)}'. Gebruik '${context.aliases.get(lookupKey)}' om dubbele database-queries te voorkomen.`);
				foundAlias = true;
			}

			if (!foundAlias) {
				let currentStr = lookupKey;
				while (currentStr.includes('.')) {
					const lastDot = currentStr.lastIndexOf('.');
					if (lastDot === 0) break;

					currentStr = currentStr.substring(0, lastDot);
					if (context.aliases.has(currentStr)) {
						const alias = context.aliases.get(currentStr);
						const originalPrefix = fullReference.substring(0, currentStr.length);
						const originalRemainder = fullReference.substring(currentStr.length);

						context.addInfo(line, `💡 Optimalisatie: Je hebt '${originalPrefix}' al opgeslagen in klasse-variabele '${alias}'. Gebruik '${alias}${originalRemainder}' om dubbele database-queries te voorkomen.`);
						break;
					}
				}
			}

			context.registerTableRef(lookupKey, fullReference, line);
			if (lookupKey.includes(".addrequest(")) context.addRequestCount++;
		}

		const cleanForVars = maskedExpr.replace(/\.\s*[a-zA-Z_]\w*/g, " @ ")
			.replace(/###STR\d+###/g, " ")
			.replace(/\b[a-zA-Z_]\w*\s*\(/g, " ")
			.replace(/\b[a-zA-Z_]\w*\s*\[/g, " ");

		const wordRegex = /\b[a-zA-Z_]\w*\b/g;
		while ((match = wordRegex.exec(cleanForVars)) !== null) {
			const word = match[0];
			const reservedWords = ["IF", "WHILE", "REPEAT", "UNTIL", "AND", "OR", "NOT", "THEN", "ELSE", "ENDIF", "DO", "DONE", "TRUE", "FALSE", "YES", "NO", "LT", "LE", "GT", "GE", "EQ", "NE", "RETURN"];
			if (isNaN(word) && !reservedWords.includes(word.toUpperCase())) {
				context.registerRead(word, line);
			}
		}
	}
};

const TypeChecker = {
	evaluate(expr, lineNo, context, targetVarName = null) {

		const STRICT_METHODS = {
			"ORDER.RESULT": { params: ["STRING", "ANY", "ANY", "ANY"], minParams: 1, returns: "RESULT" },
			"OBJECT.RESULT": { params: ["STRING", "ANY", "ANY", "ANY"], minParams: 1, returns: "RESULT" },
			"SPECIMEN.RESULT": { params: ["STRING", "ANY", "ANY", "ANY"], minParams: 1, returns: "RESULT" },
			"MICROBIOLOGYACTION.RESULT": { params: ["STRING", "ANY", "ANY", "ANY"], minParams: 1, returns: "RESULT" },

			"RESULT.RELATEDRESULT": { params: ["STRING"], minParams: 1, returns: "RESULT" },
			"RESULT.NUMERICVALUE": { params: [], minParams: 0, returns: "FRACTIONAL" },
			"RESULT.ATTRIBUTE": { params: ["STRING"], minParams: 1, returns: "STRING" },

			"ANY.RESULT": { params: ["STRING", "ANY", "ANY", "ANY"], minParams: 1, returns: "RESULT" },
			"ANY.RELATEDRESULT": { params: ["STRING"], minParams: 1, returns: "RESULT" },
			"ANY.NUMERICVALUE": { params: [], minParams: 0, returns: "FRACTIONAL" },
			"ANY.ATTRIBUTE": { params: ["STRING", "ANY", "ANY", "ANY", "ANY"], minParams: 1, returns: "STRING" },
			"ANY.ISREQUESTED": { params: ["STRING", "LOGICAL|?"], minParams: 2, returns: "LOGICAL" },
			"ANY.LASTREQUEST": { params: ["ANY"], minParams: 0, returns: "REQUEST" },
			"ANY.FIRSTREQUEST": { params: ["ANY"], minParams: 0, returns: "REQUEST" },
			"ANY.ADDREQUEST": { params: ["STRING", "ANY", "ANY"], minParams: 3, returns: "VOID" },

			"GLOBAL.IFKNOWNSTRING": { params: ["ANY"], minParams: 1, returns: "STRING" },
			"GLOBAL.INDEX": { params: ["STRING", "STRING"], minParams: 2, returns: "INTEGER" },
			"GLOBAL.REPLACE": { params: ["STRING", "STRING", "STRING"], minParams: 3, returns: "STRING" },
			"GLOBAL.ADDLOGENTRY": { params: ["STRING", "INTEGER", "STRING|?", "INTEGER|?", "LOGICAL|?", "STRING|?"], minParams: 6, returns: "LOGICAL" },

			"GLOBAL.FITTEXT": { params: ["STRING", "INTEGER", "STRING|?", "STRING|?", "STRING|?"], minParams: 2, returns: "STRING" },
			"GLOBAL.TRANSLATECHARACTERS": { params: ["STRING", "STRING", "STRING|?"], minParams: 2, returns: "STRING" },

			"GLOBAL.LPAD": { params: ["ANY", "INTEGER", "STRING|?"], minParams: 2, returns: "STRING" },
			"GLOBAL.RPAD": { params: ["ANY", "INTEGER", "STRING|?"], minParams: 2, returns: "STRING" },

			"GLOBAL.FABS": { params: ["ANY"], minParams: 1, returns: "FRACTIONAL" },
			"GLOBAL.ABS": { params: ["ANY"], minParams: 1, returns: "INTEGER" },
			"GLOBAL.ROUND": { params: ["FRACTIONAL", "INTEGER|?"], minParams: 1, returns: "FRACTIONAL" },
			"GLOBAL.FMOD": { params: ["ANY", "ANY"], minParams: 2, returns: "FRACTIONAL" },
			"GLOBAL.MOD": { params: ["ANY", "ANY"], minParams: 2, returns: "INTEGER" },
			"GLOBAL.LTRIM": { params: ["STRING", "STRING|?"], minParams: 1, returns: "STRING" },
			"GLOBAL.RTRIM": { params: ["STRING", "STRING|?"], minParams: 1, returns: "STRING" },
			"GLOBAL.TRIM": { params: ["STRING", "STRING|?"], minParams: 1, returns: "STRING" },
			"GLOBAL.STRIP": { params: ["STRING", "STRING|?"], minParams: 1, returns: "STRING" },
			"GLOBAL.LEN": { params: ["STRING"], minParams: 1, returns: "INTEGER" },
			"GLOBAL.CHR": { params: ["INTEGER"], minParams: 1, returns: "STRING" },
			"GLOBAL.SUBSTR": { params: ["STRING", "INTEGER", "INTEGER|?"], minParams: 2, returns: "STRING" },

			"GLOBAL.ENUMERATEDTOSTRING": { params: ["STRING", "ANY"], minParams: 2, returns: "STRING" },
			"GLOBAL.INTEGERTOSTRING": { params: ["ANY", "STRING|?"], minParams: 1, returns: "STRING" },
			"GLOBAL.FRACTIONALTOSTRING": { params: ["ANY", "STRING|?"], minParams: 1, returns: "STRING" },
			"GLOBAL.DATETOSTRING": { params: ["ANY", "STRING|?"], minParams: 1, returns: "STRING" },
			"GLOBAL.TIMETOSTRING": { params: ["ANY", "STRING|?"], minParams: 1, returns: "STRING" },
			"GLOBAL.DATETIMETOSTRING": { params: ["ANY", "STRING|?"], minParams: 1, returns: "STRING" },
			"GLOBAL.LOGICALTOSTRING": { params: ["LOGICAL", "STRING|?"], minParams: 1, returns: "STRING" },
			"GLOBAL.STRINGTOINTEGER": { params: ["STRING"], minParams: 1, returns: "INTEGER" },
			"GLOBAL.STRINGTOFRACTIONAL": { params: ["STRING"], minParams: 1, returns: "FRACTIONAL" },
			"GLOBAL.STRINGTODATE": { params: ["ANY", "STRING|?"], minParams: 1, returns: "DATE" },
			"GLOBAL.STRINGTOTIME": { params: ["ANY", "STRING|?"], minParams: 1, returns: "TIME" },
			"GLOBAL.DATEANDTIMETODATETIME": { params: ["ANY", "ANY"], minParams: 2, returns: "DATETIME" },
			"GLOBAL.DATETIMETODATE": { params: ["ANY"], minParams: 1, returns: "DATE" },
			"GLOBAL.DATETIMETOTIME": { params: ["ANY"], minParams: 1, returns: "TIME" }
		};

		const SAFE_UNKNOWN_FUNCS = new Set([
			"FIRSTREQUEST", "LASTREQUEST", "REQUESTEDCODE", "GETSPECIMEN", "ADDREQUEST",
			"GETPHONELOG", "GETDIAGNOSIS", "CREATESPECIMENORDER", "RESULT", "GETRESULT",
			"RESULTATTRIBUTE", "MICROBIOLOGICHISTORY", "GETPATIENTDISORDERS", "ADDCARRIERS",
			"CARRIERCOUNT", "SETSITEATTRIBUTE", "TRANSLATE", "PAYMENTAGREEMENTS",
			"GETPAYMENTAGREEMENTS", "GETINVOICEID", "EXPAND", "LOOKUP", "ENTRY", "IFKNOWNSTRING",
			"GETGENETICRESULTDETAIL", "GETGENETICEXAMS", "GETHLAEXAMS", "GETAPPROACHES",
			"GETHLATYPINGRESULTS", "GETHLASCREENINGRESULTS", "GETTRANSPLANTREGISTRATIONS",
			"GETTRANSPLANTSELECTIONS", "GETTRANSPLANT", "ASKCHOICE", "ASKSTRING", "ASKYESNO", "IDENTIFIER", "TRANSLATECHARACTERS", "FITTEXT", "LPAD", "RPAD"
		]);

		let work = String(expr);

		if (work.toUpperCase().includes("EXPAND")) {
			work = work.replace(/Chr\(123\)/gi, '"{"').replace(/Chr\(125\)/gi, '"}"');
		}

		work = work.replace(/"(?:[^"]|"")*(?:"|$)/g, (match) => match === '""' ? "<EMPTY_STRING>" : "<STRING>")

		const workNoSpaces = work.replace(/\s+/g, '');
		if (workNoSpaces.includes(',,') || workNoSpaces.includes(',)') || workNoSpaces.includes('(,')) {
			context.addError(lineNo, `❌ SYNTAX-FOUT: Lege of overtollige komma gevonden in parameters.`);
		}

		work = work.replace(/(?<![a-zA-Z0-9_])(?:\d+\.\d+|\.\d+)(?![a-zA-Z0-9_])/g, "<FRACTIONAL>");
		work = work.replace(/(?<![a-zA-Z0-9_\.])\d+(?![a-zA-Z0-9_\.])/g, "<INTEGER>");

		work = work.replace(/\?/g, "<QUESTIONMARK>");
		work = work.replace(/\b(TRUE|FALSE|YES|NO)\b/ig, "<LOGICAL>");

		work = work.replace(/\b[a-zA-Z_][a-zA-Z0-9_]*\s*\[\s*<STRING>\s*\]/g, (match) => {
			return "<INTEGER>";
		});

		const varKeys = Array.from(context.declaredVars.keys()).sort((a, b) => b.length - a.length);
		for (let vKey of varKeys) {
			const vInfo = context.declaredVars.get(vKey);
			if (vInfo && vInfo.dataType && vInfo.dataType !== "UNKNOWN") {
				const regexTest = new RegExp(`(?<!\\.)\\b${vKey}\\b(?!\\s*\\()`, 'i');
				const regexReplace = new RegExp(`(?<!\\.)\\b${vKey}\\b(?!\\s*\\()`, 'gi');

				if (regexTest.test(work)) {
					const isCheckingNull = new RegExp(`\\b${vKey}\\b\\s*(=|<>|!=|<|>|<=|>=)\\s*<QUESTIONMARK>`, 'i').test(work) ||
						new RegExp(`<QUESTIONMARK>\\s*(=|<>|!=|<|>|<=|>=)\\s*\\b${vKey}\\b`, 'i').test(work);

					// NIEUW: Check voor niet-default vergelijkingen
					const nonDefaultMatch = work.match(new RegExp(`\\b${vKey}\\b\\s*(=|<>|!=|<|>|<=|>=)\\s*([^<\\s]+)`, 'i'));
					const isCheckingNonDefault = nonDefaultMatch && !isDefaultValue(nonDefaultMatch[2], "<" + vInfo.dataType.toUpperCase() + ">");

					if (isCheckingNull) {
						// Legitiem
					} else if (!context.assignedVars.has(vKey) && isCheckingNonDefault) {
						context.addWarning(lineNo, `⚠️ WAARSCHUWING: Variabele '${vInfo.originalName}' (type ${vInfo.dataType}) wordt vergeleken met een specifieke waarde, maar heeft nog geen toewijzing (:=) gehad. Controleer of je de initialisatie niet bent vergeten.`);
					} else if (!context.assignedVars.has(vKey) && !context.uninitializedWarned.has(vKey)) {
						context.uninitializedWarned.add(vKey);
						const t = vInfo.dataType.toUpperCase();
						const isCoreType = ["STRING", "INTEGER", "FRACTIONAL", "LOGICAL", "DATE", "TIME", "DATETIME", "MNEMONIC", "VOID", "ANY"].includes(t);

						if (!isCoreType) {
							const isIteratorArg = new RegExp(`\\b(?:GetSpecimen|GetAction|GetRequests|GetResults|GetPriorResult)\\s*\\(\\s*${vKey}\\b`, 'i').test(work);
							if (!isIteratorArg) {
								context.addError(lineNo, `❌ FOUT: Klassevariabele '${vInfo.originalName}' (type ${t}) wordt gebruikt zonder toewijzing.`);
							}
						}
						context.registerWrite(vInfo.originalName, lineNo);
					}
					work = work.replace(regexReplace, `<${vInfo.dataType.toUpperCase()}>`);
				}
			}
		}

		const fallbackWordRegex = /(?<![<\.])\b[a-zA-Z_][a-zA-Z0-9_]*\b(?!\s*[\(\.])/g;
		const reservedKeywords = new Set(["IF", "WHILE", "REPEAT", "UNTIL", "AND", "OR", "NOT", "THEN", "ELSE", "ENDIF", "DO", "DONE", "TRUE", "FALSE", "YES", "NO", "LT", "LE", "GT", "GE", "EQ", "NE", "RETURN"]);

		work = work.replace(fallbackWordRegex, (match) => {
			if (reservedKeywords.has(match.toUpperCase()) || match.startsWith('STR')) return match;
			return "<ANY>";
		});

		work = work.replace(/<MNEMONIC>/ig, "<STRING>");
		work = work.replace(/<SC_USER>/ig, "<USER>");

		const isMatch = (expectedRaw, actualRaw) => {
			let expected = expectedRaw.toUpperCase().replace("POSITIVE", "").replace("INT64", "INTEGER").trim();
			let actual = actualRaw.toUpperCase().replace("POSITIVE", "").replace("INT64", "INTEGER").replace("ENUMERATED", "INTEGER").trim();

			const allowsQuestionMark = expected.endsWith("|?");
			expected = expected.replace(/\|\?$/, "");

			if (actual === "QUESTIONMARK" || actual === "UNKNOWN" || actual === "ANY") return true;
			if (expected === actual || expected === "ANY") return true;
			if (expected === "FRACTIONAL" && actual === "INTEGER") return true;
			if (expected === "STRING" && actual === "INTEGER") return true;
			if (expected === "MNEMONIC" && actual === "STRING") return true;
			if (expected === "STRING" && actual === "MNEMONIC") return true;

			const isCore = (t) => ["STRING", "INTEGER", "FRACTIONAL", "LOGICAL", "DATE", "TIME", "DATETIME", "MNEMONIC", "VOID", "ANY"].includes(t);

			if (actual === "INTEGER" && !isCore(expected)) return true;
			if (!isCore(actual) && (expected === "INTEGER" || expected === "RECORD")) return true;

			return false;
		};

		const processMethod = (callerRaw, methodName, argsStr, match, lineNo, context, prefix = "") => {
			const strippedArgs = argsStr.replace(/<[A-Z0-9_]+>/g, "").trim();
			if (/[a-zA-Z_]/.test(strippedArgs) || /[\+\-\*\/]/.test(strippedArgs) || /[\.=<>]/.test(strippedArgs)) {
				return match;
			}

			const fn = methodName.toUpperCase();
			let callerType = callerRaw ? (callerRaw.startsWith('<') ? callerRaw.replace(/[<>]/g, '').toUpperCase() : callerRaw.toUpperCase()) : "ANY";

			if (callerType === "UNKNOWN") return `${prefix}<UNKNOWN>`;

			if (callerType === "ORDR" || callerType === "ORD") callerType = "ORDER";
			if (callerType === "RSLT") callerType = "RESULT";
			if (callerType === "OBJ") callerType = "OBJECT";
			if (callerType === "SPMN") callerType = "SPECIMEN";
			if (callerType === "CRSP") callerType = "CORRESPONDENT";

			let def = STRICT_METHODS[`${callerType}.${fn}`] || STRICT_METHODS[`ANY.${fn}`] || (GLIMS_DICT.tables[callerType] ? GLIMS_DICT.tables[callerType][fn] : null);

			let returnType = def && def.returns ? def.returns.toUpperCase() : "UNKNOWN";

			if (def) {
				const rawArgs = argsStr.trim().length === 0 ? [] : argsStr.split(',');
				const actualTypes = rawArgs.map(arg => {
					const m = arg.match(/<[A-Z0-9_]+>/);
					return m ? m[0].replace(/[<>]/g, "").toUpperCase() : "UNKNOWN";
				});

				const expectedTypes = def.params || [];
				const minParams = def.minParams !== undefined ? def.minParams : expectedTypes.length;

				if (actualTypes.length < minParams) {
					context.addWarning(lineNo, `⚠️ WAARSCHUWING: Methode '${callerType}.${fn}' verwacht minimaal ${minParams} parameter(s), maar kreeg er ${actualTypes.length}.`);
				} else if (expectedTypes.length > 0 && actualTypes.length > expectedTypes.length) {
					context.addWarning(lineNo, `⚠️ WAARSCHUWING: Methode '${callerType}.${fn}' verwacht maximaal ${expectedTypes.length} parameter(s), maar kreeg er ${actualTypes.length}.`);
				} else {
					const allowedEmptyStrFuncs = ["COMMENT", "ASKCHOICE", "ASKSTRING", "ASKYESNO", "GETSPECIMEN", "LPAD", "RPAD"];
					for (let i = 0; i < actualTypes.length; i++) {
						if (expectedTypes[i]) {
							if (actualTypes[i] === "EMPTY_STRING") {
								if (allowedEmptyStrFuncs.some(f => fn.includes(f))) {
									actualTypes[i] = "STRING";
								} else {
									context.addWarning(lineNo, `⚠️ WAARSCHUWING: Methode '${callerType}.${fn}' (parameter ${i + 1}) is een lege string (""). GLIMS accepteert dit, maar controleer of dit de bedoeling is.`);
									actualTypes[i] = "STRING";
								}
							}

							if (!isMatch(expectedTypes[i], actualTypes[i])) {
								let expPrint = expectedTypes[i].replace(/\|\?$/, "");
								if (actualTypes[i] === "QUESTIONMARK") {
									context.addWarning(lineNo, `⚠️ WAARSCHUWING: Parameter ${i + 1} van '${callerType}.${fn}' mag GEEN vraagteken ('?') zijn. Verwacht type: '${expPrint}'.`);
								} else {
									context.addWarning(lineNo, `⚠️ WAARSCHUWING: Methode '${callerType}.${fn}' (parameter ${i + 1}) verwacht type '${expPrint}', maar kreeg '${actualTypes[i]}'.`);
								}
							} else if (actualTypes[i] === "QUESTIONMARK" && expectedTypes[i].includes("STRING") && !expectedTypes[i].includes("|?")) {
								if (i === 0 && (fn === "ADDREQUEST" || fn === "RESULT")) {
									context.addWarning(lineNo, `⚠️ WAARSCHUWING: Methode '${fn}' staat een '?' niet toe als eerste parameter. Vul een geldige tekst in.`);
								} else if (!SAFE_UNKNOWN_FUNCS.has(fn)) {
									context.addWarning(lineNo, `⚠️ WAARSCHUWING: Je geeft een '?' door aan parameter ${i + 1} van '${fn}'. Weet je zeker dat GLIMS dit accepteert?`);
								}
							}
						}
					}
				}
			}
			return `${prefix}<${returnType}>`;
		};

		const mathHighRegex = /<([A-Z0-9_]+)>\s*([\*\/\%])\s*<([A-Z0-9_]+)>(?!\s*[\.\(])/g;
		const mathLowRegex = /<([A-Z0-9_]+)>\s*([\+\-])\s*<([A-Z0-9_]+)>(?!\s*[\.\(])/g;
		const compRegex = /<([A-Z0-9_]+)>\s*(=|<>|!=|<|>|<=|>=)\s*<([A-Z0-9_]+)>(?!\s*[\.\(])/g;
		const logicalRegex = /<([A-Z0-9_]+)>\s*(AND|OR|&&|\|\|)\s*<([A-Z0-9_]+)>(?!\s*[\.\(])/ig;

		const checkPrecedence = (offset, matchStr, fullStr, level) => {
			const before = fullStr.substring(0, offset).trimEnd();
			const after = fullStr.substring(offset + matchStr.length).trimStart();

			if (before.endsWith('.') || after.startsWith('.')) return true;

			if (level >= 2) {
				if (/[\*\/\%]$/.test(before) || /^[\*\/\%]/.test(after)) return true;
			}
			if (level >= 3) {
				if (/[\*\/\%\+\-]$/.test(before) || /^[\*\/\%\+\-]/.test(after)) return true;
			}
			if (level >= 4) {
				if (/(=|<>|!=|<|>|<=|>=|[\*\/\%\+\-])$/.test(before) || /^(=|<>|!=|<|>|<=|>=|[\*\/\%\+\-])/.test(after)) return true;
				if (/\bNOT$/i.test(before)) return true;
			}
			return false;
		};

		let prevWork;
		let infiniteLoopGuard = 0;

		do {
			prevWork = work;

			work = work.replace(/(<[A-Z0-9_]+>|[a-zA-Z_][a-zA-Z0-9_]*)\.\s*([a-zA-Z_][a-zA-Z0-9_]*)\b(?!\s*\()/g, (match, callerRaw, prop) => {
				let typeName = callerRaw.startsWith('<') ? callerRaw.replace(/[<>]/g, '').toUpperCase() : callerRaw.toUpperCase();
				if (typeName === "ORDR" || typeName === "ORD") typeName = "ORDER";
				if (typeName === "RSLT") typeName = "RESULT";
				if (typeName === "OBJ") typeName = "OBJECT";
				if (typeName === "SPMN") typeName = "SPECIMEN";
				if (typeName === "CRSP") typeName = "CORRESPONDENT";

				let retType = "UNKNOWN";
				if (GLIMS_DICT.tables[typeName] && GLIMS_DICT.tables[typeName][prop.toUpperCase()]) {
					retType = GLIMS_DICT.tables[typeName][prop.toUpperCase()].returns.toUpperCase();
				}

				const p = prop.toUpperCase();
				if (["INTERNALID", "NAME", "MNEMONIC", "SHORTNAME", "DESCRIPTION", "EXTERNALCOMMENT", "INTERNALCOMMENT", "RAWVALUE", "VALUE", "MESSAGE", "CODE"].includes(p)) retType = "STRING";
				else if (["ID", "STATUS", "TYPE", "SEX"].includes(p)) retType = "INTEGER";
				else if (["BIRTHDATE", "DETERMINATIONDATE1", "DETERMINATIONDATE2"].includes(p)) retType = "DATE";
				else if (["OBJECTTIME", "SAMPLINGTIME", "RECEIPTTIME", "CREATIONTIME", "EXPIRATIONTIME", "CHECKOUTTIME", "TRANSFUSIONENDTIME", "UTMOSTTRANSFUSIONTIME", "CHECKTIME"].includes(p)) retType = "DATETIME";
				else if (["UNSOLICITED", "SOLICITED", "ISREQUESTED", "AVAILABLE", "VALIDATED"].includes(p)) retType = "LOGICAL";
				else if (p === "OBJECT") retType = "OBJECT";
				else if (p === "ORDER") retType = "ORDER";
				else if (p === "PERSON") retType = "PERSON";
				else if (p === "SPECIMEN") retType = "SPECIMEN";
				else if (p === "BLOODBAG") retType = "BLOODBAG";
				else if (p === "BLOODPRODUCT") retType = "BLOODPRODUCT";
				else if (p === "WARD") retType = "WARD";
				else if (p === "DEPARTMENT") retType = "DEPARTMENT";
				else if (p === "AGENT" || p === "ISSUER" || p === "TARGET") retType = "CORRESPONDENT";
				else if (p === "PROPERTY") retType = "PROPERTY";
				else if (p === "PAYMENTAGREEMENT") retType = "PAYMENTAGREEMENT";
				else if (p === "POLICYNAME") retType = "POLICYNAME";

				if (retType === "UNKNOWN") return "<UNKNOWN>";
				return `<${retType === "MNEMONIC" ? "STRING" : retType}>`;
			});

			work = work.replace(/(^|[^a-zA-Z0-9_>\]\)])\.\s*([a-zA-Z_][a-zA-Z0-9_]*)\b(?!\s*\()/g, (match, prefix, prop) => {
				let retType = "UNKNOWN";
				const p = prop.toUpperCase();

				if (["INTERNALID", "NAME", "MNEMONIC", "SHORTNAME", "DESCRIPTION", "EXTERNALCOMMENT", "INTERNALCOMMENT", "RAWVALUE", "VALUE", "MESSAGE", "CODE"].includes(p)) retType = "STRING";
				else if (["ID", "STATUS", "TYPE", "SEX"].includes(p)) retType = "INTEGER";
				else if (["BIRTHDATE", "DETERMINATIONDATE1", "DETERMINATIONDATE2"].includes(p)) retType = "DATE";
				else if (["OBJECTTIME", "SAMPLINGTIME", "RECEIPTTIME", "CREATIONTIME", "EXPIRATIONTIME", "CHECKOUTTIME", "TRANSFUSIONENDTIME", "UTMOSTTRANSFUSIONTIME", "CHECKTIME"].includes(p)) retType = "DATETIME";
				else if (["UNSOLICITED", "SOLICITED", "ISREQUESTED", "AVAILABLE", "VALIDATED"].includes(p)) retType = "LOGICAL";
				else if (p === "OBJECT") retType = "OBJECT";
				else if (p === "ORDER") retType = "ORDER";
				else if (p === "PERSON") retType = "PERSON";
				else if (p === "SPECIMEN") retType = "SPECIMEN";
				else if (p === "BLOODBAG") retType = "BLOODBAG";
				else if (p === "BLOODPRODUCT") retType = "BLOODPRODUCT";
				else if (p === "WARD") retType = "WARD";
				else if (p === "DEPARTMENT") retType = "DEPARTMENT";
				else if (p === "AGENT" || p === "ISSUER" || p === "TARGET") retType = "CORRESPONDENT";
				else if (p === "PROPERTY") retType = "PROPERTY";
				else if (p === "PAYMENTAGREEMENT") retType = "PAYMENTAGREEMENT";
				else if (p === "POLICYNAME") retType = "POLICYNAME";

				return `${prefix}<${retType}>`;
			});

			const explicitMethodRegex = /([a-zA-Z0-9_<>]+)\.\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\(([^()]*)\)/g;
			work = work.replace(explicitMethodRegex, (match, callerRaw, methodName, argsStr) => {
				return processMethod(callerRaw, methodName, argsStr, match, lineNo, context, "");
			});

			const implicitMethodRegex = /(^|[^a-zA-Z0-9_>\]\)])\.\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\(([^()]*)\)/g;
			work = work.replace(implicitMethodRegex, (match, prefix, methodName, argsStr) => {
				return processMethod(null, methodName, argsStr, match, lineNo, context, prefix);
			});

			const globalRegex = /(^|[^a-zA-Z0-9_\.>])([a-zA-Z_][a-zA-Z0-9_]*)\s*\(([^()]*)\)/g;
			work = work.replace(globalRegex, (match, prefix, funcName, argsStr) => {
				const strippedArgs = argsStr.replace(/<[A-Z0-9_]+>/g, "").trim();
				if (/[a-zA-Z_]/.test(strippedArgs) || /[\+\-\*\/]/.test(strippedArgs) || /[\.=<>]/.test(strippedArgs)) {
					return match;
				}

				const fn = funcName.toUpperCase();
				let def = STRICT_METHODS[`GLOBAL.${fn}`] || GLIMS_DICT.globals[fn];

				if (!def) return `${prefix}<UNKNOWN>`;

				let returnType = (def.returns || "UNKNOWN").toUpperCase();
				const rawArgs = argsStr.trim().length === 0 ? [] : argsStr.split(',');
				const actualTypes = rawArgs.map(arg => {
					const m = arg.match(/<[A-Z0-9_]+>/);
					return m ? m[0].replace(/[<>]/g, "").toUpperCase() : "UNKNOWN";
				});

				const expectedTypes = def.params || [];
				const minParams = def.minParams !== undefined ? def.minParams : expectedTypes.length;

				if (actualTypes.length < minParams) {
					context.addWarning(lineNo, `⚠️ WAARSCHUWING: Functie '${fn}' verwacht minimaal ${minParams} parameter(s), maar kreeg er ${actualTypes.length}.`);
				} else if (expectedTypes.length > 0 && actualTypes.length > expectedTypes.length) {
					context.addWarning(lineNo, `⚠️ WAARSCHUWING: Functie '${fn}' verwacht maximaal ${expectedTypes.length} parameter(s), maar kreeg er ${actualTypes.length}.`);
				} else {
					const allowedEmptyStrFuncs = ["IFKNOWNSTRING", "STRIP", "ASKCHOICE", "ASKSTRING", "ASKYESNO", "IDENTIFIER", "TRANSLATECHARACTERS", "FITTEXT", "LPAD", "RPAD", "GETSPECIMEN", "INDEX"];
					for (let i = 0; i < actualTypes.length; i++) {
						if (expectedTypes[i]) {
							if (actualTypes[i] === "EMPTY_STRING") {
								if (fn === "REPLACE" && i === 2) {
									actualTypes[i] = "STRING";
								} else if (allowedEmptyStrFuncs.includes(fn)) {
									actualTypes[i] = "STRING";
								} else {
									context.addWarning(lineNo, `⚠️ WAARSCHUWING: Functie '${fn}' (parameter ${i + 1}) is een lege string (""). GLIMS accepteert dit, maar controleer of dit de bedoeling is.`);
									actualTypes[i] = "STRING";
								}
							}

							if (!isMatch(expectedTypes[i], actualTypes[i])) {
								let expPrint = expectedTypes[i].replace(/\|\?$/, "");
								if (actualTypes[i] === "QUESTIONMARK") {
									context.addWarning(lineNo, `⚠️ WAARSCHUWING: Parameter ${i + 1} van '${fn}' mag GEEN vraagteken ('?') zijn. Verwacht type: '${expPrint}'.`);
								} else {
									context.addWarning(lineNo, `⚠️ WAARSCHUWING: Functie '${fn}' (parameter ${i + 1}) verwacht type '${expPrint}', maar kreeg '${actualTypes[i]}'.`);
								}
							}
						}
					}
				}
				return `${prefix}<${returnType}>`;
			});

			let parenPrev;
			do {
				parenPrev = work;
				work = work.replace(/(?<![a-zA-Z0-9_]\s*)\(\s*<([A-Z_]+)>\s*\)/g, "<$1>");
			} while (work !== parenPrev);

			let mathGuard = 0;
			const resolveMath = (match, t1, op, t2) => {
				const isCore1 = ["STRING", "INTEGER", "FRACTIONAL", "LOGICAL", "DATE", "TIME", "DATETIME", "UNKNOWN", "QUESTIONMARK", "ANY", "EMPTY_STRING"].includes(t1);
				const isCore2 = ["STRING", "INTEGER", "FRACTIONAL", "LOGICAL", "DATE", "TIME", "DATETIME", "UNKNOWN", "QUESTIONMARK", "ANY", "EMPTY_STRING"].includes(t2);
				if (!isCore1 || !isCore2) return match;

				if (t1 === "EMPTY_STRING") t1 = "STRING";
				if (t2 === "EMPTY_STRING") t2 = "STRING";
				if (t1 === "UNKNOWN" || t2 === "UNKNOWN" || t1 === "QUESTIONMARK" || t2 === "QUESTIONMARK" || t1 === "ANY" || t2 === "ANY") return "<UNKNOWN>";

				if (op === "+") {
					if (t1 === "STRING" || t2 === "STRING") {
						return "<STRING>";
					}
				} else if (op === "%") {
					if (t1 === "STRING" || t2 === "STRING") {
						context.addWarning(lineNo, `⚠️ WAARSCHUWING: Je kunt de operator '${op}' niet gebruiken op een STRING.`);
						return "<UNKNOWN>";
					}
					if (t1 !== "INTEGER" || t2 !== "INTEGER") {
						context.addWarning(lineNo, `⚠️ WAARSCHUWING: De modulo operator '%' verwacht normaal gesproken INTEGERs.`);
					}
					return "<INTEGER>";
				} else {
					if (t1 === "STRING" || t2 === "STRING") {
						context.addWarning(lineNo, `⚠️ WAARSCHUWING: Je kunt de operator '${op}' niet gebruiken op een STRING.`);
						return "<UNKNOWN>";
					}
				}

				const isTemporal1 = t1 === "DATE" || t1 === "TIME" || t1 === "DATETIME";
				const isTemporal2 = t2 === "DATE" || t2 === "TIME" || t2 === "DATETIME";
				const isNum1 = t1 === "INTEGER" || t1 === "FRACTIONAL" || t1 === "ENUMERATED";
				const isNum2 = t2 === "INTEGER" || t2 === "FRACTIONAL" || t2 === "ENUMERATED";

				if (isTemporal1 && isNum2 && (op === "+" || op === "-")) return `<${t1}>`;
				if (isNum1 && isTemporal2 && op === "+") return `<${t2}>`;

				if (isTemporal1 && isTemporal2 && op === "-") {
					if (t1 === "DATE" && t2 === "DATE") return "<INTEGER>";
					if (t1 === "TIME" && t2 === "TIME") return "<INTEGER>";
					return "<FRACTIONAL>";
				}

				if (t1 === "FRACTIONAL" || t2 === "FRACTIONAL") return "<FRACTIONAL>";
				return "<INTEGER>";
			};

			let unaryPrev;
			do {
				unaryPrev = work;
				work = work.replace(/(^|[=<>!\(\*\/\s]|AND|OR|&&|\|\|)[\+\-]\s*<([A-Z0-9_]+)>(?!\s*\.)/ig, (match, p1, p2, offset, fullStr) => {
					if (checkPrecedence(offset, match, fullStr, 2)) return match;
					return `${p1}<${p2}>`;
				});
			} while (work !== unaryPrev);

			let mathPrev;
			do {
				mathPrev = work;
				work = work.replace(mathHighRegex, (match, t1, op, t2, offset, fullStr) => {
					if (checkPrecedence(offset, match, fullStr, 1)) return match;
					return resolveMath(match, t1, op, t2);
				});
			} while (work !== mathPrev);

			do {
				mathPrev = work;
				work = work.replace(mathLowRegex, (match, t1, op, t2, offset, fullStr) => {
					if (checkPrecedence(offset, match, fullStr, 2)) return match;
					return resolveMath(match, t1, op, t2);
				});
			} while (work !== mathPrev);

			do {
				parenPrev = work;
				work = work.replace(/(?<![a-zA-Z0-9_]\s*)\(\s*<([A-Z_]+)>\s*\)/g, "<$1>");
			} while (work !== parenPrev);


			let compPrev;
			do {
				compPrev = work;
				work = work.replace(compRegex, (match, t1, op, t2, offset, fullStr) => {
					if (checkPrecedence(offset, match, fullStr, 3)) return match;

					if (t1 === "EMPTY_STRING") t1 = "STRING";
					if (t2 === "EMPTY_STRING") t2 = "STRING";

					if (t1 === "QUESTIONMARK" || t2 === "QUESTIONMARK" || t1 === "UNKNOWN" || t2 === "UNKNOWN" || t1 === "ANY" || t2 === "ANY") {
						return "<LOGICAL>";
					}

					const isTemporal1 = t1 === "DATE" || t1 === "TIME" || t1 === "DATETIME";
					const isTemporal2 = t2 === "DATE" || t2 === "TIME" || t2 === "DATETIME";
					if (isTemporal1 && isTemporal2) return "<LOGICAL>";

					const isNum1 = t1 === "INTEGER" || t1 === "FRACTIONAL" || t1 === "ENUMERATED";
					const isNum2 = t2 === "INTEGER" || t2 === "FRACTIONAL" || t2 === "ENUMERATED";

					if (t1 === "ENUMERATED" || t2 === "ENUMERATED") return "<LOGICAL>";

					if (!isMatch(t1, t2) && !isMatch(t2, t1) && !(isNum1 && isNum2)) {
						if ((isTemporal1 && isNum2) || (isNum1 && isTemporal2)) {
							// Valid in GLIMS
						} else if ((t1 === "LOGICAL" && (t2 === "STRING" || t2 === "INTEGER" || t2 === "FRACTIONAL")) ||
							(t2 === "LOGICAL" && (t1 === "STRING" || t1 === "INTEGER" || t1 === "FRACTIONAL"))) {
							// Valid in GLIMS
						} else {
							context.addWarning(lineNo, `⚠️ WAARSCHUWING: Mogelijk type-conflict. Je vergelijkt '${t1}' en '${t2}' ('${op}'). Controleer of dit valide is in GLIMS.`);
						}
					}
					return "<LOGICAL>";
				});
			} while (work !== compPrev);

			do {
				parenPrev = work;
				work = work.replace(/(?<![a-zA-Z0-9_]\s*)\(\s*<([A-Z_]+)>\s*\)/g, "<$1>");
			} while (work !== parenPrev);


			let notPrev;
			do {
				notPrev = work;
				work = work.replace(/\bNOT\s+<([A-Z0-9_]+)>/ig, (match, t1, offset, fullStr) => {
					if (checkPrecedence(offset, match, fullStr, 4)) return match;
					const isCore1 = ["STRING", "INTEGER", "FRACTIONAL", "LOGICAL", "DATE", "TIME", "DATETIME", "UNKNOWN", "QUESTIONMARK", "ANY", "EMPTY_STRING"].includes(t1);
					if (!isCore1) return match;
					return "<LOGICAL>";
				});
			} while (work !== notPrev);

			let logPrev;
			do {
				logPrev = work;
				work = work.replace(logicalRegex, (match, t1, op, t2, offset, fullStr) => {
					if (checkPrecedence(offset, match, fullStr, 4)) return match;
					const isCore1 = ["STRING", "INTEGER", "FRACTIONAL", "LOGICAL", "DATE", "TIME", "DATETIME", "UNKNOWN", "QUESTIONMARK", "ANY", "EMPTY_STRING"].includes(t1);
					const isCore2 = ["STRING", "INTEGER", "FRACTIONAL", "LOGICAL", "DATE", "TIME", "DATETIME", "UNKNOWN", "QUESTIONMARK", "ANY", "EMPTY_STRING"].includes(t2);
					if (!isCore1 || !isCore2) return match;

					return "<LOGICAL>";
				});
			} while (work !== logPrev);

			do {
				parenPrev = work;
				work = work.replace(/(?<![a-zA-Z0-9_]\s*)\(\s*<([A-Z_]+)>\s*\)/g, "<$1>");
			} while (work !== parenPrev);

			infiniteLoopGuard++;
		} while (work !== prevWork && infiniteLoopGuard < 50);

		if (targetVarName) {
			const varInfo = context.declaredVars.get(targetVarName.toLowerCase());
			if (varInfo && varInfo.dataType && varInfo.dataType !== "UNKNOWN") {
				const targetType = varInfo.dataType.toUpperCase();
				const finalMatch = work.match(/^<([A-Z_]+)>$/);
				if (finalMatch) {
					let finalType = finalMatch[1];
					if (finalType === "EMPTY_STRING") finalType = "STRING";
					if (finalType === "ENUMERATED") finalType = "INTEGER";

					const isCoreTypeTarget = ["STRING", "INTEGER", "FRACTIONAL", "LOGICAL", "DATE", "TIME", "DATETIME", "MNEMONIC", "VOID", "ANY"].includes(targetType);

					if (!isMatch(targetType, finalType) && finalType !== "UNKNOWN" && finalType !== "QUESTIONMARK" && finalType !== "ANY") {
						const isTemporalTarget = ["DATE", "TIME", "DATETIME"].includes(targetType);
						const isTemporalFinal = ["DATE", "TIME", "DATETIME"].includes(finalType);
						const isNumTarget = ["INTEGER", "FRACTIONAL"].includes(targetType);
						const isNumFinal = ["INTEGER", "FRACTIONAL"].includes(finalType);

						if (!isCoreTypeTarget && (finalType === "INTEGER" || finalType === "ENUMERATED" || finalType === "STRING")) {
							// Valid
						} else if ((isTemporalTarget && isNumFinal) || (isNumTarget && isTemporalFinal) || (isTemporalTarget && isTemporalFinal)) {

							if (isTemporalTarget && isNumFinal) {
								context.addInfo(lineNo, `💡 Stijl-tip: Je wijst een getal toe aan een datum/tijd variabele ('${targetVarName}'). GLIMS accepteert dit (getallen worden als dagen/seconden gezien), maar let op de leesbaarheid.`);
							} else if (isNumTarget && isTemporalFinal) {
								context.addError(lineNo, `❌ FOUT: Je wijst een Datum/Tijd toe aan een Getalvariabele ('${targetVarName}'). Gebruik DateTimeToInteger() of soortgelijke functies om fouten in berekeningen te voorkomen.`);
							} else {
								context.addWarning(lineNo, `⚠️ WAARSCHUWING: Je probeert een '${finalType}' toe te wijzen aan de variabele '${targetVarName}' (type '${targetType}'). Controleer of dit de bedoeling is.`);
							}

						} else {
							context.addWarning(lineNo, `⚠️ WAARSCHUWING: Je probeert een '${finalType}' toe te wijzen aan de variabele '${targetVarName}' (type '${targetType}'). Controleer op type-mismatches.`);
						}
					}
				}
			}
		}

		return work;
	}
};

module.exports = { ExpressionParser, TypeChecker };