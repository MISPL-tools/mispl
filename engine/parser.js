const astPath = require("path").join(__dirname, "../ast.js");
const { NodeTypes } = require(astPath);
console.log(">>> AST GELADEN VAN:", astPath); // Kijk in je Output venster of dit pad klopt!

// Importeer de helpers die nu in utils.js staan
const { removeCommentsDepthAware, maskTextMispl, getMaskedForKeywords, isStatementComplete } = require("./utils");

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

module.exports = { parseMISPL };