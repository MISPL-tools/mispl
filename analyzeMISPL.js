const fs = require("fs");
const path = require("path");
const { NodeTypes } = require("./ast");
const PREFIXES = require("./features/glimsPrefixes");

const VERSION = "v2.71.0 - Fixes That Make Everybody Happy";

// 🛡️ HELPER: Checkt of een waarde de default is voor een bepaald type
const isDefaultValue = (val, type) => {
	const t = type.toUpperCase();
	if (t === "INTEGER") return val === "0";
	if (t === "FRACTIONAL") return val === "0" || val === "0.0";
	if (t === "STRING") return val === "" || val === "<EMPTY_STRING>";
	if (t === "LOGICAL") return val === "FALSE";
	if (t === "DATE" || t === "TIME" || t === "DATETIME") return val === "?" || val === "";
	return false;
};

let DICT_LOAD_ERROR = null;
let GLIMS_DICT = { globals: {}, tables: {} };
try {
	const dictPath = path.join(__dirname, "features", "glimsDictionary.json");
	if (fs.existsSync(dictPath)) {
		const rawData = fs.readFileSync(dictPath, "utf8");
		const cleanData = rawData.replace(/^\uFEFF/, '');
		GLIMS_DICT = JSON.parse(cleanData);
		if (!GLIMS_DICT.globals) GLIMS_DICT.globals = {};
		if (!GLIMS_DICT.tables) GLIMS_DICT.tables = {};
	} else {
		DICT_LOAD_ERROR = "glimsDictionary.json niet gevonden in de 'features' map.";
	}
} catch (e) {
	DICT_LOAD_ERROR = "Fout bij inlezen JSON: " + e.message;
}

// 🛡️ HELPER: 100% Depth-Aware Comment Remover
function removeCommentsDepthAware(text) {
	let result = "";
	let inString = false;
	let stringChar = '';
	let depth = 0;
	let i = 0;
	while (i < text.length) {
		const c = text[i];
		const next = text[i + 1] || '';

		if (depth === 0 && !inString) {
			if (c === '/' && next === '*') {
				depth++;
				i += 2;
			} else if (c === '"' || c === "'") {
				inString = true;
				stringChar = c;
				result += c;
				i++;
			} else {
				result += c;
				i++;
			}
		} else if (inString) {
			if (c === stringChar) {
				if (next === stringChar) {
					result += c + next;
					i += 2;
				} else {
					inString = false;
					result += c;
					i++;
				}
			} else {
				result += c;
				i++;
			}
		} else if (depth > 0) {
			if (c === '/' && next === '*') {
				depth++;
				i += 2;
			} else if (c === '*' && next === '/') {
				depth--;
				i += 2;
			} else {
				i++;
			}
		}
	}
	return result;
}

function maskTextMispl(code) {
	let clean = removeCommentsDepthAware(code).replace(/"(?:[^"]|"")*"/g, '').replace(/'(?:[^']|'')*'/g, '');

	let hasBraceBlock = false;
	for (let i = 0; i < clean.length - 1; i++) {
		if (clean[i] === '{' && (clean[i + 1] === ':' || clean[i + 1] === '=' || clean[i + 1] === '<' || (clean[i + 1] === '/' && clean[i + 2] === '*'))) {
			hasBraceBlock = true;
			break;
		}
	}

	let hasReturn = /\bRETURN\b/i.test(clean);
	let hasAssignment = /:=/.test(clean);
	let startsWithComment = /^\s*\/\*/.test(code);

	let isTextMispl = false;
	if (hasBraceBlock) {
		isTextMispl = true;
	} else if (!hasReturn && !hasAssignment && !startsWithComment) {
		isTextMispl = true;
	}

	if (!isTextMispl) {
		return { masked: code, isTextMispl: false, errors: [], trailingWarning: null };
	}

	let masked = "";
	let mode = "TEXT";
	let inBlockString = false;
	let inBlockComment = false;
	let blockStringQuote = '';
	let errors = [];
	let lastClosingBraceIndex = -1;

	for (let i = 0; i < code.length; i++) {
		const char = code[i];

		if (mode === "TEXT") {
			const isEscaped = (i > 0 && code[i - 1] === '~');

			if (char === '{' && !isEscaped) {
				const remainder = code.substring(i + 1);

				if (remainder.startsWith(':')) {
					mode = "PROG";
					masked += '  '; i++;
				} else if (remainder.startsWith('=') || remainder.startsWith('<')) {
					mode = "EXPR";
					masked += '  '; i++;
				} else if (/^\s*\/\*/.test(remainder)) {
					mode = "PROG";
					masked += ' ';
				} else {
					const peek = remainder.trimStart().toUpperCase();
					const looksLikeCode = peek.startsWith('RETURN') || peek.startsWith('STRING') || peek.startsWith('INTEGER') || peek.startsWith('LOGICAL') || peek.startsWith('FRACTIONAL') || peek.startsWith('IF ') || peek.startsWith('WHILE ') || peek.startsWith('REPEAT') || peek.startsWith('OBJECT ') || peek.startsWith('DATETIME ');

					if (looksLikeCode) {
						errors.push({ index: i, msg: "FOUT: Vergeten dubbele punt! Een code- of commentaarblok in TekstMISPL moet altijd beginnen met '{:'." });
						mode = "PROG";
					} else {
						errors.push({ index: i, msg: "FOUT: Losse '{' in tekst. Gebruik '~{' als je dit letterlijk wilt tonen, of '{:', '{=', '{<' voor code." });
					}
					masked += ' ';
				}
			} else if (char === '}' && !isEscaped) {
				errors.push({ index: i, msg: "FOUT: Losse '}' in tekst. Gebruik '~}' als je dit letterlijk wilt tonen." });
				masked += ' ';
			} else {
				masked += (char === '\n' || char === '\r') ? char : ' ';
			}
		} else if (mode === "EXPR") {
			if (char === '}') {
				mode = "TEXT";
				lastClosingBraceIndex = i;
			}
			masked += (char === '\n' || char === '\r') ? char : ' ';
		} else if (mode === "PROG") {
			if (!inBlockString && !inBlockComment) {
				if (char === '/' && code[i + 1] === '*') {
					inBlockComment = true;
					masked += '/*';
					i++;
				} else if (char === '"' || char === "'") {
					inBlockString = true;
					blockStringQuote = char;
					masked += char;
				} else if (char === '}') {
					mode = "TEXT";
					lastClosingBraceIndex = i;
					masked += ' ';
				} else {
					masked += char;
				}
			} else if (inBlockString) {
				if (char === blockStringQuote) {
					if (i + 1 < code.length && code[i + 1] === blockStringQuote) {
						masked += char + code[i + 1];
						i++;
					} else {
						inBlockString = false;
						masked += char;
					}
				} else {
					masked += char;
				}
			} else if (inBlockComment) {
				if (char === '*' && code[i + 1] === '/') {
					inBlockComment = false;
					masked += '*/';
					i++;
				} else {
					masked += char;
				}
			}
		}
	}

	if (mode === "PROG" || mode === "EXPR") {
		errors.push({ index: code.length - 1, msg: "FOUT: TekstMISPL blok is geopend maar nergens afgesloten met een '}'." });
	}

	let trailingWarning = null;
	if (lastClosingBraceIndex !== -1 && mode === "TEXT") {
		const afterLastBrace = code.substring(lastClosingBraceIndex + 1);
		if (afterLastBrace.length > 0 && /^\s+$/.test(afterLastBrace)) {
			trailingWarning = "💡 INFO: Er staan nog onzichtbare tekens (spaties, tabs of enters) na de allerlaatste '}'. GLIMS print deze mee in de uitslag. Verwijder ze om een schone output te garanderen.";
		}
	}

	return { masked, isTextMispl: true, errors, trailingWarning };
}

function getMaskedForKeywords(text) {
	let masked = "";
	let parenDepth = 0;
	let squareDepth = 0;
	let inQuote = false;
	let quoteChar = '';

	for (let i = 0; i < text.length; i++) {
		let c = text[i];
		if (!inQuote && (c === '"' || c === "'")) {
			inQuote = true;
			quoteChar = c;
			masked += '"';
		} else if (inQuote) {
			if (c === quoteChar) {
				if (i + 1 < text.length && text[i + 1] === quoteChar) {
					masked += '  ';
					i++;
				} else {
					inQuote = false;
					masked += '"';
				}
			} else {
				masked += ' ';
			}
		} else {
			if (c === '[') {
				squareDepth++;
				masked += '[';
			} else if (c === ']') {
				squareDepth--;
				masked += ']';
			} else if (c === '(') {
				if (parenDepth === 0) masked += '('; else masked += ' ';
				parenDepth++;
			} else if (c === ')') {
				parenDepth--;
				if (parenDepth === 0) masked += ')'; else masked += ' ';
			} else if (parenDepth > 0 || squareDepth > 0) {
				masked += ' ';
			} else {
				masked += c;
			}
		}
	}
	return masked;
}

function isStatementComplete(text) {
	let p = 0, s = 0, inQ = false, q = '';
	for (let i = 0; i < text.length; i++) {
		const c = text[i];
		if (!inQ && (c === '"' || c === "'")) {
			inQ = true; q = c;
		} else if (inQ) {
			if (c === q) {
				if (i + 1 < text.length && text[i + 1] === q) {
					i++;
				} else {
					inQ = false;
				}
			}
		} else {
			if (c === '(') p++;
			else if (c === ')') p--;
			else if (c === '[') s++;
			else if (c === ']') s--;
		}
	}
	return p <= 0 && s <= 0 && !inQ;
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

class AnalysisContext {
	constructor(errors = []) {
		this.errors = errors;
		this.declaredVars = new Map();
		this.usedVars = new Map();
		this.tableRefs = new Map();
		this.aliases = new Map();
		this.assignedVars = new Map();
		this.readVars = new Set();
		this.uninitializedWarned = new Set();
		this.addRequestCount = 0;
	}

	addError(line, message) { this.errors.push({ line, message, severity: 8 }); }
	addWarning(line, message) { this.errors.push({ line, message, severity: 4 }); }
	addInfo(line, message) { this.errors.push({ line, message, severity: 2 }); }

	registerDeclaration(name, line, dataType = "UNKNOWN") {
		const key = String(name).toLowerCase();
		if (!this.declaredVars.has(key)) {
			this.declaredVars.set(key, { line, originalName: name, dataType: dataType });
		}
	}

	registerRead(name, line) {
		if (!name) return;
		this.readVars.add(String(name).toLowerCase());
		this.registerUsage(name, line);
	}

	registerWrite(name, line) {
		if (!name) return;
		const key = String(name).toLowerCase();
		for (const [cachedExpression, cachedVarName] of this.aliases.entries()) {
			if (new RegExp(`\\b${key}\\b`).test(cachedExpression)) this.aliases.delete(cachedExpression);
		}
		const info = this.assignedVars.get(key) || { lines: [], originalName: name };
		info.lines.push(line);
		this.assignedVars.set(key, info);
		this.registerUsage(name, line);
	}

	registerUsage(name, line) {
		if (!name) return;
		const key = String(name).toLowerCase();
		const info = this.usedVars.get(key) || { lines: [], originalName: name };
		info.lines.push(line);
		this.usedVars.set(key, info);
	}

	registerTableRef(lookupKey, originalName, line) {
		const info = this.tableRefs.get(lookupKey) || { count: 0, lines: [], originalName: originalName };
		info.count++;
		info.lines.push(line);
		this.tableRefs.set(lookupKey, info);
	}

	registerAssignment(varName, valueExpr) {
		if (ExpressionParser.isPureReference(valueExpr)) {
			const clean = String(valueExpr).trim().replace(/\s+/g, "").toLowerCase();
			this.aliases.set(clean, varName);
		}
	}
}

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

		work = work.replace(/"(?:[^"]|"")*(?:"|$)/g, (match) => match === '""' ? "<EMPTY_STRING>" : "<STRING>")
			.replace(/'(?:[^']|'')*(?:'|$)/g, (match) => match === "''" ? "<EMPTY_STRING>" : "<STRING>");

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
					const isCheckingNonDefault = nonDefaultMatch && !isDefaultValue(nonDefaultMatch[2], vInfo.dataType);

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

const Validators = {
	checkHungarianNotation(node, context) {
		const dataType = node.datatype || node.dataType || node.varType || node.typeValue;
		if (!dataType || !node.name || node.name === "_sV") return;

		const typeKey = String(dataType).toLowerCase();
		if (typeKey === "integer" && /^[IJK]$/i.test(node.name)) return;

		const validPrefixes = PREFIXES[typeKey];
		if (validPrefixes) {
			const nameLower = String(node.name).toLowerCase();

			if (validPrefixes.some(p => p.toLowerCase() === nameLower)) return;

			const isValidCamel = validPrefixes.some(prefix => {
				if (nameLower.startsWith(prefix.toLowerCase())) {
					const remainder = node.name.substring(prefix.length);
					if (remainder.length > 0) return /^[A-Z0-9_]/.test(remainder[0]);
				}
				return false;
			});

			if (!isValidCamel) {
				let cleanName = String(node.name);
				if (/^[a-z]+[A-Z]/.test(cleanName)) cleanName = cleanName.replace(/^[a-z]+/, '');
				cleanName = cleanName.charAt(0).toUpperCase() + cleanName.slice(1);
				context.addInfo(node.line, `👮 Stijl-tip: Variabele '${node.name}' is type '${dataType}'. Conventie: '${validPrefixes[0]}' (bijv. '${validPrefixes[0] + cleanName}' of gewoon '${validPrefixes[0]}').`);
			}
		}
	},

	analyzeScope(node, context) {
		if (node.type === NodeTypes.Declaration) {
			context.registerDeclaration(node.name, node.line, node.dataType || node.datatype || "UNKNOWN");
			this.checkHungarianNotation(node, context);
		}

		if (node.type === NodeTypes.Assignment) {
			const valClean = node.value ? String(node.value).trim().toUpperCase() : "";
			if (valClean === '""') context.addInfo(node.line, `💡 Code-tip: GLIMS initialiseert Strings automatisch als "".`);
		}

		let exprToAnalyze = null;
		let targetVarName = null;

		if (node.type === NodeTypes.Assignment) {
			exprToAnalyze = node.value;
			targetVarName = node.name;
		}
		else if (node.type === NodeTypes.IfStatement) exprToAnalyze = node.condition;
		else if (node.type === NodeTypes.WhileStatement) exprToAnalyze = node.condition;
		else if (node.type === NodeTypes.ReturnStatement) exprToAnalyze = node.expression;
		else if (node.type === NodeTypes.GenericStatement) exprToAnalyze = node.condition || node.text;

		if (exprToAnalyze) {
			ExpressionParser.extractReferences(String(exprToAnalyze), node.line, context);
			TypeChecker.evaluate(exprToAnalyze, node.line, context, targetVarName);
		}

		if (node.type === NodeTypes.Assignment) {
			context.registerWrite(node.name, node.line);
			context.registerAssignment(node.name, node.value);
		}
	},

	analyzeStructure(node, context) { },

	analyzeLoops(nodes, context) {
		if (!Array.isArray(nodes)) return;
		const getVarsInExpr = (expr) => {
			if (!expr) return [];
			const matches = String(expr).match(/[a-zA-Z_][a-zA-Z0-9_]*/g) || [];
			const reserved = new Set(["IF", "THEN", "ELSE", "ENDIF", "WHILE", "DO", "DONE", "REPEAT", "UNTIL", "RETURN", "AND", "OR", "NOT", "TRUE", "FALSE", "YES", "NO", "LT", "LE", "GT", "GE", "EQ", "NE", "STR"]);
			return matches.filter(m => !reserved.has(m.toUpperCase()) && isNaN(m));
		};

		const heavyFuncList = ["Expand", "GetSiteAttribute", "Lookup", "GetLogEntry", "GetResult", "GetCode", "GetMedicalRecord", "GetEncounter"];
		const iteratorFunctions = /\b(GetSpecimen|GetAction|GetRequests|GetResults|GetPriorResult|GetNextResult|GetResult)\s*\(/i;

		for (let i = 0; i < nodes.length; i++) {
			const node = nodes[i];
			let loopCondition = null, blockEnd = -1, type = null;

			if (node.type === NodeTypes.WhileStatement) { loopCondition = node.condition; type = 'WHILE'; }
			else if (node.type === NodeTypes.RepeatStatement) type = 'REPEAT';
			else continue;

			let depth = 1;
			for (let k = i + 1; k < nodes.length; k++) {
				const sub = nodes[k];
				if ([NodeTypes.WhileStatement, NodeTypes.RepeatStatement, NodeTypes.IfStatement].includes(sub.type)) depth++;
				if (sub.type === "Done" || sub.type === "EndIf" || sub.isUntil) {
					depth--;
					if (depth === 0) {
						if (type === 'REPEAT' && sub.isUntil) loopCondition = sub.condition;
						blockEnd = k; break;
					}
				}
			}

			if (loopCondition && blockEnd > -1) {
				const conditionVars = getVarsInExpr(loopCondition).map(v => v.toLowerCase());
				const assignedInLoop = new Set();
				const loopAssignments = [];
				let hasIterator = false;

				for (let m = i + 1; m < blockEnd; m++) {
					const subNode = nodes[m];
					if (subNode.type === NodeTypes.Assignment) {
						const targetName = String(subNode.name).toLowerCase();
						assignedInLoop.add(targetName);
						loopAssignments.push({ target: targetName, expr: subNode.value });
					}
					let exprToCheck = subNode.value || subNode.condition || subNode.expression || subNode.text;
					if (exprToCheck && iteratorFunctions.test(String(exprToCheck))) {
						hasIterator = true;
					}
				}

				// FIX: Diepte-bewuste functie argumenten checker ter vervanging van de oude RegEx
				for (let m = i + 1; m < blockEnd; m++) {
					const subNode = nodes[m];
					let exprToCheck = subNode.value || subNode.condition || subNode.expression || subNode.text;
					if (exprToCheck) {
						const safeExpr = String(exprToCheck);
						if (safeExpr.toLowerCase().includes(".addrequest(")) context.addInfo(subNode.line, `💡 Prestatie-tip: Verzamel .AddRequest() buiten de lus.`);

						for (let hFunc of heavyFuncList) {
							const regexTest = new RegExp(`\\b${hFunc}\\s*\\(`, 'gi');
							let match;
							while ((match = regexTest.exec(safeExpr)) !== null) {
								let start = match.index + match[0].length;
								let parenCount = 1;
								let p = start;
								let inStr = false;
								let strChar = '';

								while (p < safeExpr.length && parenCount > 0) {
									const c = safeExpr[p];
									if (!inStr && (c === '"' || c === "'")) {
										inStr = true; strChar = c;
									} else if (inStr && c === strChar) {
										if (p + 1 < safeExpr.length && safeExpr[p + 1] === strChar) p++;
										else inStr = false;
									} else if (!inStr) {
										if (c === '(') parenCount++;
										else if (c === ')') parenCount--;
									}
									p++;
								}

								// Dit is de EXACTE tekst tussen de haakjes van de functie
								const argsStr = safeExpr.substring(start, p - 1);

								let isDependent = false;
								for (let av of getVarsInExpr(argsStr)) {
									if (assignedInLoop.has(av.toLowerCase())) { isDependent = true; break; }
								}
								if (!isDependent) {
									context.addInfo(subNode.line, `⚡ Prestatie-tip: '${hFunc}' staat in een loop maar argumenten wijzigen niet. Bereken dit 1x voor de loop en gebruik een variabele!`);
								}
							}
						}
					}
				}

				let isProperlyUpdated = false;
				let staticAssignmentWarning = null;

				for (let condVar of conditionVars) {
					if (assignedInLoop.has(condVar)) {
						let hasValidUpdate = false;

						for (let assign of loopAssignments) {
							if (assign.target === condVar) {
								const rhsVars = getVarsInExpr(assign.expr).map(v => v.toLowerCase());

								if (rhsVars.length === 0) {
									hasValidUpdate = true;
								} else {
									let rhsIsDynamic = false;
									for (let rv of rhsVars) {
										if (assignedInLoop.has(rv)) {
											rhsIsDynamic = true;
											break;
										}
									}

									if (iteratorFunctions.test(String(assign.expr))) {
										rhsIsDynamic = true;
									}

									if (rhsIsDynamic) {
										hasValidUpdate = true;
									}
								}
							}
						}

						if (hasValidUpdate) {
							isProperlyUpdated = true;
							break;
						} else {
							staticAssignmentWarning = `Variabele '${condVar}' krijgt in de loop een waarde via andere variabelen, maar geen van die variabelen verandert. Ben je vergeten een index (zoals 'I') op te hogen?`;
						}
					}
				}

				if (conditionVars.length > 0 && !isProperlyUpdated && !hasIterator) {
					if (staticAssignmentWarning) {
						context.addWarning(node.line, `⚠️ WAARSCHUWING: Mogelijke oneindige ${type}-loop! ${staticAssignmentWarning}`);
					} else {
						context.addWarning(node.line, `⚠️ WAARSCHUWING: Mogelijke oneindige ${type}-loop! Geen van de variabelen in de conditie wordt binnen de loop bijgewerkt.`);
					}
				}
			}
		}
	},

	analyzeIfStatements(nodes, context) {
		if (!Array.isArray(nodes)) return;
		for (let i = 0; i < nodes.length; i++) {
			const node = nodes[i];
			if (node.type === NodeTypes.IfStatement) {
				let thenNodes = [], elseNodes = [], inElse = false, depth = 1;
				for (let j = i + 1; j < nodes.length; j++) {
					const sub = nodes[j];
					if ([NodeTypes.WhileStatement, NodeTypes.RepeatStatement, NodeTypes.IfStatement].includes(sub.type)) depth++;
					if (sub.type === "Else" && depth === 1) { inElse = true; continue; }
					if (sub.type === "Done" || sub.type === "EndIf" || sub.isUntil) { depth--; if (depth === 0) break; }
					if (depth > 0) inElse ? elseNodes.push(sub) : thenNodes.push(sub);
				}

				if (inElse && thenNodes.length > 0 && thenNodes.length === elseNodes.length) {
					const strip = (n) => { const { line, ...rest } = n; return rest; };
					if (JSON.stringify(thenNodes.map(strip)) === JSON.stringify(elseNodes.map(strip))) {
						context.addWarning(node.line, `⚠️ Logica-waarschuwing: Code in THEN is identiek aan ELSE. Deze IF doet niets.`);
					}
				}
			}
		}
	}
};

function parseSingleStatement(stmt, lineNo, maskedStmt = null, addError, declaredVars, hasExecutableStatement, resultNodes, validateExpression) {
	const trimmed = stmt.trim();
	if (!trimmed || trimmed === ";") return [];

	const masked = maskedStmt ? maskedStmt : getMaskedForKeywords(trimmed);

	if (trimmed.startsWith("/")) { addError(lineNo, 'FOUT: onjuist gebruik "/"'); return []; }

	if (!masked.includes(":=") && !masked.includes("(") && !/^(IF|WHILE|REPEAT|RETURN|UNTIL|ELSE|ENDIF|DONE|THEN|DO)\b/i.test(masked)) {
		const declMatch = /^([a-zA-Z_][a-zA-Z0-9_]*)\s+([^=;]+);$/.exec(trimmed);
		if (declMatch) {
			const typeName = declMatch[1];
			let varListString = removeCommentsDepthAware(declMatch[2]);
			if (!new Set(["TRUE", "FALSE", "YES", "NO", "AND", "OR", "NOT"]).has(typeName.toUpperCase())) {

				if (hasExecutableStatement) {
					addError(lineNo, `FOUT: Declaratie van '${typeName}' is te laat. Alle variabelen moeten in één blok bovenaan gedeclareerd worden, vóór de eerste actie of toewijzing.`);
				}

				varListString.split(",").forEach(raw => {
					const name = raw.trim();
					if (name.length === 0) addError(lineNo, "FOUT: Lege variabele gedetecteerd.");
					else if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name)) addError(lineNo, `FOUT: variabele '${name}' bevat ongeldige karakters.`);
					else {
						const key = name.toLowerCase();
						if (declaredVars.has(key)) addError(lineNo, `FOUT: variabele '${name}' is reeds gedeclareerd.`);
						else {
							declaredVars.set(key, typeName.toUpperCase());
							resultNodes.push({ type: NodeTypes.Declaration, name: name, dataType: typeName, line: lineNo });
						}
					}
				});
				return resultNodes;
			}
		}
	}

	if (/^RETURN\b/i.test(masked)) {
		hasExecutableStatement = true;
		const content = trimmed.substring(6).replace(/;$/, "").trim();
		validateExpression(content, lineNo, "RETURN-waarde");
		return [{ type: NodeTypes.ReturnStatement, expression: content, line: lineNo }];
	}

	const firstIdx = masked.indexOf(":=");
	if (firstIdx !== -1) {
		hasExecutableStatement = true;
		if (!trimmed.endsWith(";")) addError(lineNo, "FOUT: Statement moet eindigen met ';'.");
		const name = trimmed.substring(0, firstIdx).trim();
		const value = trimmed.substring(firstIdx + 2).replace(/;$/, "").trim();

		if (name.startsWith(".")) {
			const cleanName = name.replace(/^\./, '');
			if (declaredVars.has(cleanName.toLowerCase()) || /^(s|i|l|b|f|d|obj|ordr|rslt)[A-Z]/.test(cleanName)) {
				addError(lineNo, `FOUT: Lokale variabelen ('${cleanName}') mogen niet voorafgegaan worden door een punt.`);
				return [];
			}
		}

		if (!/^[a-zA-Z_][a-zA-Z0-9_\.]*$/.test(name)) {
			addError(lineNo, `FOUT: '${name}' is geen geldige variabele. Ben je een puntkomma (;) vergeten op de vorige regel?`);
			return [];
		}
		validateExpression(value, lineNo, "Assignment-waarde", name);
		return [{ type: NodeTypes.Assignment, name, value, line: lineNo }];
	}

	if (/^\.?[a-zA-Z_][a-zA-Z0-9_\.]*\s*\(/.test(masked.replace(/\s+/g, ''))) {
		hasExecutableStatement = true;
		if (!trimmed.endsWith(";")) {
			addError(lineNo, "FOUT: Statement moet eindigen met ';'.");
		}
		validateExpression(trimmed, lineNo, "Functie-aanroep");
		return [{ type: NodeTypes.GenericStatement, text: trimmed, line: lineNo }];
	}

	addError(lineNo, `FOUT: Onbekend statement of onjuiste syntax: '${trimmed}'.`);
	return [];
}

function parseMISPL(rawCode) {
	const maskResult = maskTextMispl(rawCode);
	const code = maskResult.masked;
	const lines = code.split(/\r?\n/);

	const errors = [];
	const body = [];

	let commentState = { depth: 0 };
	let blockStack = [];
	let hasFoundFirstCodeLine = false;
	let hasExecutableStatement = false;
	const declaredVars = new Map();

	function addError(line, message) { errors.push({ line, message, severity: 8 }); }
	function addInfo(line, message) { errors.push({ line, message, severity: 2 }); }
	function addWarning(line, message) { errors.push({ line, message, severity: 4 }); }

	if (maskResult.isTextMispl) {
		maskResult.errors.forEach(e => {
			let lineNo = 0;
			if (e.index >= 0 && e.index < rawCode.length) {
				lineNo = rawCode.substring(0, e.index).split(/\r?\n/).length - 1;
			} else {
				lineNo = lines.length - 1;
			}
			addError(lineNo, e.msg);
		});
		if (maskResult.trailingWarning) {
			const lastLine = lines.length - 1;
			addInfo(lastLine, maskResult.trailingWarning);
		}
	}

	if (code.length > 31984) {
		addWarning(0, `LET OP: De MISPL code is te lang (${code.length} karakters). De limiet van GLIMS is ca. 31.984 karakters.`);
	}

	function closeBlock(expectedType, line, closeText) {
		const top = blockStack[blockStack.length - 1];
		if (!top) {
			addError(line, `FOUT: ${closeText} zonder ${expectedType}.`);
			return false;
		}
		if (top.type === expectedType) {
			blockStack.pop();
			return true;
		} else {
			addError(top.line - 1, `FOUT: ${top.type}-blok (gestart op regel ${top.line}) is niet afgesloten.`);
			blockStack.pop();
			return closeBlock(expectedType, line, closeText);
		}
	}

	function validateExpression(expr, lineNo, context, targetVarName = null) {
		let work = expr.trim();
		const hasTrailingSemi = work.endsWith(";");
		if (work.toUpperCase().includes("EXPAND")) {
			work = work.replace(/Chr\(123\)/gi, '"{"').replace(/Chr\(125\)/gi, '"}"');
		}
		if (hasTrailingSemi) {
			work = work.slice(0, -1).trim();
		}

		if (!work) {
			addError(lineNo, `FOUT: ${context} mag niet leeg zijn.`);
			return;
		}

		let hasSingleQuoteError = false;
		let singleQuoteCheck = work.replace(/"(?:[^"]|"")*(?:"|$)/g, " STR ")
			.replace(/'(?:[^']|'')*(?:'|$)/g, () => {
				hasSingleQuoteError = true;
				return " STR ";
			});

		if (/\(\s*,|,\s*,|,\s*\)/.test(singleQuoteCheck)) {
			addError(lineNo, `❌ SYNTAX-FOUT: Lege parameter of overtollige komma gevonden (bijv. '(,', ',)' of ',,').`);
		}

		if (hasSingleQuoteError || singleQuoteCheck.includes("'")) {
			addError(lineNo, "FOUT: Tekst moet tussen dubbele aanhalingstekens (\"). Enkele aanhalingstekens (') zijn niet toegestaan.");
		}

		let clean = singleQuoteCheck;

		clean = clean.replace(/\.\s+([a-zA-Z_])/g, ".$1");
		clean = clean.replace(/>\.\s*([a-zA-Z_])/g, ">.$1");

		const illegalCharMatch = clean.match(/[{}]/);
		if (illegalCharMatch) {
			addError(lineNo, `FOUT: Ongeldig karakter '${illegalCharMatch[0]}' gevonden. Accolades ('{', '}') worden niet ondersteund in MISPL.`);
			return;
		}

		let parenCount = 0;
		let squareCount = 0;
		for (let i = 0; i < clean.length; i++) {
			if (clean[i] === '(') parenCount++;
			else if (clean[i] === ')') parenCount--;
			else if (clean[i] === '[') squareCount++;
			else if (clean[i] === ']') squareCount--;

			if (parenCount < 0) {
				addWarning(lineNo, `⚠️ WAARSCHUWING: Onverwacht sluitend haakje ')' gevonden in ${context}. Mogelijk is de regel afgekapt of staan haakjes verkeerd.`);
				parenCount = 0;
			}
			if (squareCount < 0) {
				addWarning(lineNo, `⚠️ WAARSCHUWING: Onverwacht sluitend haakje ']' gevonden in ${context}. Mogelijk is de regel afgekapt of staan haakjes verkeerd.`);
				squareCount = 0;
			}
		}
		if (parenCount > 0) {
			addWarning(lineNo, `⚠️ WAARSCHUWING: Ontbrekend sluitend haakje ')' in ${context}. Er openen meer haakjes dan er sluiten.`);
		}
		if (squareCount > 0) {
			addWarning(lineNo, `⚠️ WAARSCHUWING: Ontbrekend sluitend haakje ']' in ${context}. Er openen meer haakjes dan er sluiten.`);
		}

		if (clean.includes(":=")) {
			addError(lineNo, "FOUT: Syntax error. Regel moet eindigen met ';'. (Onverwachte ':=' gevonden in expressie)");
		}

		if (/\b(RETURN|WHILE|REPEAT|FOR|ENDIF|DONE|UNTIL)\b/i.test(clean)) {
			addError(lineNo, "FOUT: Syntax error. Regel moet eindigen met ';'. (Gereserveerd woord in expressie gevonden)");
		}

		const localPropRegex = /\.([a-zA-Z_][a-zA-Z0-9_]*)/g;
		let localPropMatch;
		while ((localPropMatch = localPropRegex.exec(clean)) !== null) {
			const originalName = localPropMatch[1];
			const propName = originalName.toLowerCase();

			const isHungarian = /^(s|sl|stl|i|l|b|f|d|dt|tm|obj|ordr|rslt|prsn|spmn|crsp|actn|mat|rqst)[A-Z_]/.test(originalName);

			if (declaredVars.has(propName) && isHungarian) {
				addError(lineNo, `FOUT: Lokale variabele '${originalName}' mag niet voorafgegaan worden door een punt. Een punt is alleen voor object-eigenschappen.`);
			}
		}

		const leadingOpMatch = clean.match(/^\s*(?:[\+\*\/=!&|%]|\bAND\b|\bOR\b|\bLT\b|\bLE\b|\bGT\b|\bGE\b|\bEQ\b|\bNE\b)/i);
		if (leadingOpMatch) {
			const op = leadingOpMatch[0].trim().toUpperCase();
			if (op === '+') {
				addInfo(lineNo, `💡 Stijl-tip: ${context} begint met een operator ('+'). Dit is toegestaan in GLIMS voor tekstsamenvoeging.`);
			} else {
				addError(lineNo, `FOUT: ${context} mag niet beginnen met een operator ('${op}').`);
			}
		}

		const danglingOpMatch = clean.match(/(?:[\+\-\*\/=!&|\.%]|\bAND\b|\bOR\b|\bLT\b|\bLE\b|\bGT\b|\bGE\b|\bEQ\b|\bNE\b)\s*$/i);
		if (danglingOpMatch) addError(lineNo, `FOUT: ${context} mag niet eindigen op operator ('${danglingOpMatch[0].trim()}').`);
	}

	function processChunk(chunk, hasSemi, lineNo) {
		const trimmed = chunk.trim();
		if (!trimmed) return;

		const maskedTrimmed = getMaskedForKeywords(trimmed);

		if (/^ENDIF\b/i.test(maskedTrimmed)) {
			hasExecutableStatement = true;
			const rest = trimmed.substring(5).trim();
			if (rest.length > 0 && !rest.startsWith(';')) addError(lineNo, `FOUT: Ongeldige syntax '${rest}' na ENDIF.`);
			closeBlock("IF", lineNo, "ENDIF");
			body.push({ type: "EndIf", line: lineNo });
			if (!hasSemi) addError(lineNo, "FOUT: na een ENDIF moet altijd een \";\"");
			return;
		}

		if (/^DONE\b/i.test(maskedTrimmed)) {
			hasExecutableStatement = true;
			const rest = trimmed.substring(4).trim();
			if (rest.length > 0 && !rest.startsWith(';')) addError(lineNo, `FOUT: Ongeldige syntax '${rest}' na DONE.`);
			closeBlock("WHILE", lineNo, "DONE");
			body.push({ type: "Done", line: lineNo });
			if (!hasSemi) addError(lineNo, "FOUT: na een DONE moet altijd een \";\"");
			return;
		}

		if (/^ELSE\b/i.test(maskedTrimmed)) {
			hasExecutableStatement = true;
			body.push({ type: "Else", line: lineNo });
			const remainder = trimmed.substring(4).trim();
			if (remainder) processChunk(remainder, hasSemi, lineNo);
			return;
		}

		if (/^UNTIL\b/i.test(maskedTrimmed)) {
			hasExecutableStatement = true;
			if (closeBlock("REPEAT", lineNo, "UNTIL")) {
				const condition = trimmed.substring(5).trim();
				validateExpression(condition, lineNo, "UNTIL-conditie");
				body.push({ type: NodeTypes.GenericStatement, text: "UNTIL " + condition, condition: condition, isUntil: true, line: lineNo });
				if (!hasSemi) addError(lineNo, "FOUT: na een UNTIL moet altijd een \";\"");
			}
			return;
		}

		if (/^IF\b/i.test(maskedTrimmed)) {
			hasExecutableStatement = true;
			const thenMatch = /\bTHEN\b/i.exec(maskedTrimmed);
			if (!thenMatch) { addError(lineNo, "FOUT: IF zonder THEN."); return; }
			const condition = trimmed.substring(2, thenMatch.index).trim();
			validateExpression(condition, lineNo, "IF-conditie");
			blockStack.push({ type: "IF", line: lineNo });
			body.push({ type: NodeTypes.IfStatement, condition: condition, line: lineNo });
			const afterThen = trimmed.substring(thenMatch.index + 4).trim();
			if (afterThen) processChunk(afterThen, hasSemi, lineNo);
			return;
		}

		if (/^WHILE\b/i.test(maskedTrimmed)) {
			hasExecutableStatement = true;
			const doMatch = /\bDO\b/i.exec(maskedTrimmed);
			if (!doMatch) { addError(lineNo, "FOUT: WHILE zonder DO."); return; }
			const condition = trimmed.substring(5, doMatch.index).trim();
			validateExpression(condition, lineNo, "WHILE-conditie");
			blockStack.push({ type: "WHILE", line: lineNo });
			body.push({ type: NodeTypes.WhileStatement, condition: condition, line: lineNo });
			const afterDo = trimmed.substring(doMatch.index + 2).trim();
			if (afterDo) processChunk(afterDo, hasSemi, lineNo);
			return;
		}

		if (/^REPEAT\b/i.test(maskedTrimmed)) {
			hasExecutableStatement = true;
			blockStack.push({ type: "REPEAT", line: lineNo });
			body.push({ type: NodeTypes.RepeatStatement, line: lineNo });
			const remainder = trimmed.substring(6).trim();
			if (remainder) processChunk(remainder, hasSemi, lineNo);
			return;
		}

		const stmts = parseSingleStatement(trimmed + (hasSemi ? ";" : ""), lineNo, maskedTrimmed, addError, declaredVars, hasExecutableStatement, [], validateExpression);
		stmts.forEach(s => body.push(s));
	}

	function processSegmentWithKeywords(segText, hasSemi, lineNo) {
		const maskedSeg = getMaskedForKeywords(segText);

		let isInlineExpression = false;
		if (/^\s*RETURN\b/i.test(maskedSeg)) isInlineExpression = true;
		if (/^\s*[a-zA-Z_][a-zA-Z0-9_\.]*\s*:=/i.test(maskedSeg)) isInlineExpression = true;

		if (isInlineExpression) {
			processChunk(segText, hasSemi, lineNo);
			return;
		}

		const keywords = [];
		const kwRegex = /\b(ENDIF|DONE|ELSE|UNTIL)\b/gi;
		let m;
		while ((m = kwRegex.exec(maskedSeg)) !== null) keywords.push(m);

		if (keywords.length === 0) processChunk(segText, hasSemi, lineNo);
		else {
			const firstKw = keywords[0];
			if (firstKw) {
				const pre = segText.substring(0, firstKw.index);
				const post = segText.substring(firstKw.index);
				if (pre.trim()) processChunk(pre, false, lineNo);
				if (post.trim()) processChunk(post, hasSemi, lineNo);
			}
		}
	}

	function processRemainder(text, lineNo) {
		if (!text || !text.trim()) return "";
		const segments = smartSplit(text);
		for (let i = 0; i < segments.length - 1; i++) processSegmentWithKeywords(segments[i], true, lineNo);

		const lastSeg = segments[segments.length - 1];
		const trimmedLast = lastSeg.trim();
		if (!trimmedLast) return "";

		const maskedLast = getMaskedForKeywords(trimmedLast);
		const up = maskedLast.toUpperCase();

		if (isStatementComplete(trimmedLast) && ((/^IF\b/.test(up) && /\bTHEN\b/.test(up)) || (/^WHILE\b/.test(up) && /\bDO\b/.test(up)) || /^REPEAT\b/.test(up) || /^ELSE\b/.test(up))) {
			processSegmentWithKeywords(lastSeg, false, lineNo);
			return "";
		}
		return lastSeg;
	}

	function smartSplit(text) {
		const parts = [];
		let current = "", inQuote = false, quoteType = null;
		for (let i = 0; i < text.length; i++) {
			const char = text[i];
			if (char === '"' || char === "'") {
				if (!inQuote) { inQuote = true; quoteType = char; }
				else if (char === quoteType) { inQuote = false; quoteType = null; }
			}
			if (char === ';' && !inQuote) { parts.push(current); current = ""; }
			else current += char;
		}
		parts.push(current);
		return parts;
	}

	function stripBlockCommentsFromLine(line, state) {
		if (state.depth === undefined) state.depth = 0;
		let result = "";
		let i = 0;
		let inString = false;
		let stringChar = '';

		while (i < line.length) {
			if (state.depth === 0) {
				if (!inString && (line[i] === '"' || line[i] === "'")) {
					inString = true;
					stringChar = line[i];
					result += line[i];
					i++;
				} else if (inString && line[i] === stringChar) {
					if (i + 1 < line.length && line[i + 1] === stringChar) {
						result += line[i] + line[i + 1];
						i += 2;
					} else {
						inString = false;
						result += line[i];
						i++;
					}
				} else if (inString) {
					result += line[i];
					i++;
				} else if (line.startsWith("/*", i)) {
					state.depth++;
					i += 2;
					result += " ";
				} else {
					result += line[i];
					i++;
				}
			} else {
				if (line.startsWith("/*", i)) {
					state.depth++;
					i += 2;
				} else if (line.startsWith("*/", i)) {
					state.depth--;
					i += 2;
				} else {
					i++;
				}
			}
		}
		return result;
	}

	function mergeBrokenLines(linesArray) {
		const merged = [];
		let buffer = "";
		let startLineNo = 0;
		let inString = false;
		let stringChar = '';

		for (let i = 0; i < linesArray.length; i++) {
			let cleanLine = linesArray[i].text;
			if (!cleanLine) continue;

			if (buffer.length === 0) {
				startLineNo = linesArray[i].originalLineNo;
			}

			for (let j = 0; j < cleanLine.length; j++) {
				if (!inString && (cleanLine[j] === '"' || cleanLine[j] === "'")) {
					inString = true;
					stringChar = cleanLine[j];
				} else if (inString && cleanLine[j] === stringChar) {
					if (j + 1 < cleanLine.length && cleanLine[j + 1] === stringChar) { j++; }
					else { inString = false; }
				}
			}

			buffer += (buffer.length > 0 ? " " : "") + cleanLine;

			const up = cleanLine.toUpperCase();

			if (!inString && (cleanLine.endsWith(';') ||
				(/^IF\b/i.test(buffer.trim()) && /\bTHEN$/i.test(cleanLine)) ||
				/^ELSE$/i.test(cleanLine) ||
				/^ENDIF$/i.test(cleanLine) ||
				/^DONE$/i.test(cleanLine) ||
				(/^WHILE\b/i.test(buffer.trim()) && /\bDO$/i.test(cleanLine)) ||
				/^REPEAT$/i.test(cleanLine) ||
				/^UNTIL\b/i.test(cleanLine)
			)) {
				merged.push({ originalLineNo: startLineNo, text: buffer });
				buffer = "";
			}
		}
		if (buffer.trim()) merged.push({ originalLineNo: startLineNo, text: buffer });
		return merged;
	}

	const preProcessedLines = lines.map((rawLine, i) => {
		if (!hasFoundFirstCodeLine) {
			const lineTrim = rawLine.trim();
			if (lineTrim.length > 0) hasFoundFirstCodeLine = true;
		}

		let clean = stripBlockCommentsFromLine(rawLine, commentState).trim();
		if (!clean) return { originalLineNo: i, text: "" };

		const m1Regex = /(?<![a-zA-Z_])(\d+)(THEN|DO|AND|OR|LT|LE|GT|GE|EQ|NE|ELSE|ENDIF|DONE|UNTIL|REPEAT|WHILE|RETURN)\b/ig;
		if (m1Regex.test(clean)) {
			m1Regex.lastIndex = 0;
			clean = clean.replace(m1Regex, (match, p1, p2) => {
				addWarning(i, `⚠️ WAARSCHUWING: Geen spatie tussen getal en keyword ('${match.trim()}'). GLIMS accepteert dit, maar voeg een spatie toe voor de leesbaarheid.`);
				return `${p1} ${p2}`;
			});
		}

		const m2Regex = /\b(IF|THEN|DO|AND|OR|LT|LE|GT|GE|EQ|NE|ELSE|ENDIF|DONE|UNTIL|REPEAT|WHILE|RETURN)(\d+)(?![a-zA-Z_])/ig;
		if (m2Regex.test(clean)) {
			m2Regex.lastIndex = 0;
			clean = clean.replace(m2Regex, (match, p1, p2) => {
				addWarning(i, `⚠️ WAARSCHUWING: Geen spatie tussen keyword en getal ('${match.trim()}').`);
				return `${p1} ${p2}`;
			});
		}

		if (/^IF\b.*\;\s*THEN/i.test(clean)) {
			addError(i, "FOUT: Puntkomma ';' mag niet tussen IF en THEN staan.");
		}

		return { originalLineNo: i, text: clean };
	});

	const mergedLines = mergeBrokenLines(preProcessedLines);

	let lineBuffer = "";
	let currentBufferLineNo = 0;

	for (let i = 0; i < mergedLines.length; i++) {
		let blockObj = mergedLines[i];

		if (lineBuffer) {
			lineBuffer += " " + blockObj.text;
		} else {
			lineBuffer = blockObj.text;
			currentBufferLineNo = blockObj.originalLineNo;
		}

		lineBuffer = processRemainder(lineBuffer, currentBufferLineNo);
	}

	if (lineBuffer && lineBuffer.trim()) {
		processChunk(lineBuffer, false, currentBufferLineNo);
	}

	blockStack.forEach(open => {
		if (open.type === "REPEAT") addError(open.line - 1, "FOUT: REPEAT..UNTIL; wordt niet afgesloten");
		else addError(open.line - 1, `FOUT: ${open.type}-blok is niet afgesloten.`);
	});

	const variableTypes = new Map();
	body.forEach(node => {
		if (node.type === NodeTypes.Declaration) {
			const key = node.name.toLowerCase();
			declaredVars.set(key, { line: node.line, originalName: node.name, dataType: node.dataType });
			variableTypes.set(key, node.dataType);
		}
	});

	return {
		ast: { type: NodeTypes.Program, body: body },
		errors: errors,
		isTextMispl: maskResult.isTextMispl,
		variables: variableTypes
	};
}

function analyze(astOrResult, rawText = "") {
	const errors = [];
	let ast = astOrResult && typeof astOrResult === "object" ? (astOrResult.ast || astOrResult) : null;
	if (astOrResult && Array.isArray(astOrResult.errors)) astOrResult.errors.forEach(e => errors.push({ line: e.line || 0, message: String(e.message || e), severity: e.severity || 8 }));

	const context = new AnalysisContext(errors);

	const safeText = typeof rawText === "string" ? rawText : "";

	if (safeText.trim() !== "" && !safeText.includes("/*")) context.addInfo(0, `💡 Stijl-tip: Een MISPL hoort te beginnen met een /* commentaarblok */.`);

	const codeZonderCommentaar = removeCommentsDepthAware(safeText);
	const upperTextClean = codeZonderCommentaar.toUpperCase();

	if ((upperTextClean.includes("IF ") || upperTextClean.includes("THEN") || codeZonderCommentaar.includes(":=") || upperTextClean.includes("STRING")) && !upperTextClean.includes("RETURN")) {
		context.addError(0, "FOUT: Ontbrekend RETURN statement. Een GLIMS script moet een waarde retourneren.");
	}

	try {
		if (ast && ast.type === NodeTypes.Program && Array.isArray(ast.body)) {
			ast.body.forEach(node => { Validators.analyzeScope(node, context); Validators.analyzeStructure(node, context); });
			Validators.analyzeLoops(ast.body, context);
			Validators.analyzeIfStatements(ast.body, context);

			context.usedVars.forEach((info, key) => {
				if (!context.declaredVars.has(key)) context.addError(info.lines[0] || 0, `❌ FOUT: Variabele '${info.originalName}' gebruikt maar niet gedeclareerd.`);
			});

			context.declaredVars.forEach((info, key) => {
				if (!context.usedVars.has(key)) context.addWarning(info.line, `Variabele '${info.originalName}' wordt nooit gebruikt.`);
			});

			context.assignedVars.forEach((info, key) => {
				if (!context.readVars.has(key)) info.lines.forEach(lineNo => context.addWarning(lineNo, `⚠️ WAARSCHUWING: Waarde van '${info.originalName}' wordt hierna nooit meer uitgelezen (Mogelijke dode code of overbodige query).`));
			});
		}
	} catch (err) {
		context.addError(0, `🚨 Linter Fout: ${err.message}`);
	}

	return {
		errors: context.errors,
		variables: astOrResult.variables || new Map()
	};
}

module.exports = { analyze, parseMISPL, VERSION };
