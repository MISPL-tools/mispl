const { NodeTypes } = require("./ast");
const { t } = require("./i18n"); // 🌍 Importeer de i18n module

// De Heilige Graal: Alle tabel-onafhankelijke (globale) MISPL functies
const GLOBAL_FUNCTIONS = new Set([
    "ABS", "ADDLOGENTRY", "APPROACHACTIVITYFROMLIST", "APPROACHFROMLIST", "ASKCHOICE", "ASKSTRING", "ASKYESNO", "CHR", "COUNTCHARACTER", "CPAD", "CURRENTDEPARTMENT", "CURRENTDEVICE", "CURRENTOS", "CURRENTROLE", "CURRENTTERMINAL", "CURRENTUSER", "DATEANDTIMETODATETIME", "DATEDIDENTIFIER", "DATEDIFFINYEARS", "DATETIMETODATE", "DATETIMETOSTRING", "DATETIMETOTIME", "DATETOSTRING", "DISEASEFROMLIST", "DISORDERASSOCIATIONFROMLIST", "ENTRY", "ENUMERATEDTOSTRING", "EUROTOLOCAL", "EXP", "EXPAND", "EXTRACTTAG", "FABS", "FAMILYMEMBERFROMLIST", "FILL", "FITTEXT", "FMOD", "FRACTIONALTOINTEGER", "FRACTIONALTOSTRING", "GENEFROMLIST", "GENETICEXAMFROMLIST", "GETCODE", "GETCORRESPONDENT", "GETCORRESPONDENTID", "GETDEPARTMENT", "GETDIAGNOSISCODE", "GETENCOUNTER", "GETEXECUTINGLAB", "GETFUNDID", "GETHLAANTIGEN", "GETINVOICEID", "GETINVOICESUMMARYID", "GETLOGENTRY", "GETNONCONFORMITY", "GETOBJECTID", "GETPOLICYNAMEID", "GETPRINTERID", "GETPROVISION", "GETSITEATTRIBUTE", "GETSTAY", "GETUSER", "GLIMS", "HLAEXAMFROMLIST", "HLASCREENINGRESULTFROMLIST", "HLATYPINGRESULTFROMLIST", "IDENTIFIER", "IFKNOWNSTRING", "INDEX", "INTEGERTOSTRING", "ISEVEN", "ISHOLIDAY", "ISTESTDB", "ITEMSTORAGEFROMLIST", "LARGEMODULO", "LEN", "LOCALTOEURO", "LOCUSMASTERMIXFROMLIST", "LOCUSMASTERMIXITEMFROMLIST", "LOG", "LOG10", "LOOKUP", "LPAD", "LTRIM", "MATCHES", "MESSAGE", "MODULUS11", "NEXTVALUE", "NOW", "NUMBERTOSTRINGINFULL", "NUMENTRIES", "ORD", "PATIENTDISORDERFROMLIST", "PAYMENTAGREEMENTS", "PEEKCHARACTER", "PEEKDATE", "PEEKDECIMAL", "PEEKINTEGER", "PEEKLOGICAL", "PEEKRECID", "PHENOTYPEFROMLIST", "PLATEFROMLIST", "PLATEITEMFROMLIST", "POKECHARACTER", "POKEDATE", "POKEDECIMAL", "POKEINTEGER", "POKELOGICAL", "POKERECID", "PUTTAG", "RANGELABEL", "REGISTERNONCONFORMITY", "REMOVEENTRY", "REPLACE", "ROUND", "RPAD", "RTRIM", "SENDMAIL", "SETSITEATTRIBUTE", "SORT", "SPECIMEN", "SQRT", "START", "STRINGTODATE", "STRINGTOENUMERATED", "STRINGTOFRACTIONAL", "STRINGTOINTEGER", "STRINGTOOGM", "STRINGTOTIME", "STRIP", "SUBSTR", "TARIFFINGDATA", "TIMETOSTRING", "TODAY", "TOEURO", "TOLOCAL", "TOLOWER", "TOSTRING", "TOUPPER", "TRANSLATE", "TRANSLATECHARACTERS", "TRANSPLANTFROMLIST", "TRANSPLANTREGISTRATIONFROMLIST", "TRANSPLANTSELECTIONFROMLIST", "TRIM", "TRUNCATE", "WEIGHEDMODULUS", "WEIGHEDMODULUS11", "XMLESCAPED"
]);

// Gereserveerde taal-elementen
const RESERVED_WORDS = new Set([
    "IF", "THEN", "ELSE", "ENDIF", "WHILE", "DO", "DONE", "REPEAT", "UNTIL", "RETURN",
    "AND", "OR", "NOT", "TRUE", "FALSE", "YES", "NO",
    "LT", "LE", "GT", "GE", "EQ", "NE"
]);

// --- DE SLIMME TEKSTMISPL STATE MACHINE ---
function maskTextMispl(code) {
    let clean = code.replace(/"[^"]*"/g, '').replace(/'[^']*'/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
    
    let hasBraceBlock = false;
    for(let i=0; i<clean.length-1; i++) {
        if (clean[i] === '{' && (clean[i+1] === ':' || clean[i+1] === '=' || clean[i+1] === '<' || (clean[i+1] === '/' && clean[i+2] === '*'))) {
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
            const isEscaped = (i > 0 && code[i-1] === '~');

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
                        errors.push({ index: i, msg: t('ERR_TEXTMISPL_NO_COLON') });
                        mode = "PROG"; 
                    } else {
                        errors.push({ index: i, msg: t('ERR_TEXTMISPL_STRAY_OPEN') });
                    }
                    masked += ' '; 
                }
            } else if (char === '}' && !isEscaped) {
                errors.push({ index: i, msg: t('ERR_TEXTMISPL_STRAY_CLOSE') });
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
                if (char === '/' && code[i+1] === '*') {
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
                    inBlockString = false;
                }
                masked += char;
            } else if (inBlockComment) {
                if (char === '*' && code[i+1] === '/') {
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
        errors.push({ index: code.length - 1, msg: t('ERR_TEXTMISPL_UNCLOSED') });
    }

    let trailingWarning = null;
    if (lastClosingBraceIndex !== -1 && mode === "TEXT") {
        const afterLastBrace = code.substring(lastClosingBraceIndex + 1);
        if (afterLastBrace.length > 0 && /^\s+$/.test(afterLastBrace)) {
            trailingWarning = t('INFO_TEXTMISPL_TRAILING_CHARS');
        }
    }

    return { masked, isTextMispl: true, errors, trailingWarning };
}

function parseMISPL(rawCode) {
    const maskResult = maskTextMispl(rawCode);
    const code = maskResult.masked;
    const lines = code.split(/\r?\n/);
    
    const errors = [];
    const body = [];

    let commentState = { inBlock: false };
    let blockStack = [];
    let hasFoundFirstCodeLine = false;
    let hasExecutableStatement = false; 
    const declaredVars = new Map();
    let lineBuffer = "";

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

    if (code.length > 31000) {
        addWarning(0, t('WARN_CODE_TOO_LONG', code.length));
    }

    function closeBlock(expectedType, line, closeText) {
        const top = blockStack[blockStack.length - 1];
        if (!top) {
            addError(line, t('ERR_BLOCK_CLOSE_WITHOUT_OPEN', closeText, expectedType));
            return false;
        }
        if (top.type === expectedType) {
            blockStack.pop();
            return true;
        } else {
            addError(top.line - 1, t('ERR_BLOCK_NOT_CLOSED_VAR', top.type, top.line));
            blockStack.pop();
            return closeBlock(expectedType, line, closeText);
        }
    }

    function validateExpression(expr, lineNo, context, targetVarName = null) {
        let work = expr.trim();
        const hasTrailingSemi = work.endsWith(";");
        if (hasTrailingSemi) {
             work = work.slice(0, -1).trim();
        }

        if (!work) {
            addError(lineNo, t('ERR_CONTEXT_EMPTY', context));
            return;
        }

        let hasSingleQuoteError = false;
        const clean = work.replace(/"[^"]*"/g, " STR ").replace(/'[^']*'/g, () => {
            hasSingleQuoteError = true;
            return " STR ";
        });

        if (hasSingleQuoteError || clean.includes("'")) {
            addError(lineNo, t('ERR_SINGLE_QUOTES'));
        }

        const illegalCharMatch = clean.match(/[[\]{}]/);
        if (illegalCharMatch) {
            addError(lineNo, t('ERR_ILLEGAL_BRACKETS', illegalCharMatch[0]));
            return;
        }

        let parenCount = 0;
        for (let i = 0; i < clean.length; i++) {
            if (clean[i] === '(') parenCount++;
            else if (clean[i] === ')') parenCount--;
            
            if (parenCount < 0) {
                addError(lineNo, t('ERR_UNEXPECTED_CLOSE_PAREN', context));
                return; 
            }
        }
        if (parenCount > 0) {
            addError(lineNo, t('ERR_MISSING_CLOSE_PAREN', context));
            return; 
        }

        if (clean.includes(":=")) {
            addError(lineNo, t('ERR_UNEXPECTED_ASSIGN'));
            return; 
        }
        if (/\b(RETURN|IF|WHILE|REPEAT|FOR|ELSE|ENDIF|DONE|UNTIL)\b/i.test(clean)) {
            addError(lineNo, t('ERR_RESERVED_WORD_IN_EXPR'));
            return; 
        }

        // DE FIX VOOR DE PUNT-FOUT: We controleren nu op Hongaarse Notatie
        const localPropRegex = /\.([a-zA-Z_][a-zA-Z0-9_]*)/g;
        let localPropMatch;
        while ((localPropMatch = localPropRegex.exec(clean)) !== null) {
            const originalName = localPropMatch[1];
            const propName = originalName.toLowerCase();
            
            // Controleer of de variabele duidelijk een lokaal voorvoegsel heeft
            // Echte object-eigenschappen (zoals .PIN, .Name, .LowestObjectTime) hebben dit niet!
            const isHungarian = /^(s|sl|stl|i|l|b|f|d|dt|tm|obj|ordr|rslt|prsn|spmn|crsp|actn|mat|rqst)[A-Z_]/.test(originalName);

            if (declaredVars.has(propName) && isHungarian) {
                addError(lineNo, t('ERR_LOCAL_VAR_DOT', originalName));
                return;
            }
        }

        const leadingOpMatch = clean.match(/^\s*(?:[\+\*\/=!&|]|\bAND\b|\bOR\b|\bLT\b|\bLE\b|\bGT\b|\bGE\b|\bEQ\b|\bNE\b)/i);
        if (leadingOpMatch) addError(lineNo, t('ERR_STARTS_WITH_OP', context, leadingOpMatch[0].trim()));

        const danglingOpMatch = clean.match(/(?:[\+\-\*\/=!&|\.]|\bAND\b|\bOR\b|\bLT\b|\bLE\b|\bGT\b|\bGE\b|\bEQ\b|\bNE\b)\s*$/i);
        if (danglingOpMatch) addError(lineNo, t('ERR_ENDS_WITH_OP', context, danglingOpMatch[0].trim()));

        const tokenRegex = /\.?[a-zA-Z_][a-zA-Z0-9_]*(?:\.[a-zA-Z_][a-zA-Z0-9_]*)*|\d+(?:\.\d+)?|\?|<=|>=|<>|!=|==|&&|\|\||[=<>!/\\\+\-\*&|\(\),.]/g;
        const tokens = clean.match(tokenRegex) || [];
        let prevOperand = null;

        for (const token of tokens) {
            if (token === '.') {
                addError(lineNo, t('ERR_STRAY_DOT'));
                return;
            }

            const isKeywordOp = /^(AND|OR|NOT|LT|LE|GT|GE|EQ|NE)$/i.test(token);
            const isPunctuationOrOp = /^[=<>!/\\\+\-\*&|\(\),]$/.test(token) || /^(<=|>=|<>|!=|==|&&|\|\|)$/.test(token);
            const isOperand = !isKeywordOp && !isPunctuationOrOp;

            if (isOperand) {
                if (prevOperand !== null) {
                    if (prevOperand === ')' && token.startsWith('.')) {
                        // Geldig method chaining
                    } else {
                        const displayPrev = prevOperand === 'STR' ? 'tekst' : prevOperand;
                        const displayCurr = token === 'STR' ? 'tekst' : token;
                        addError(lineNo, t('ERR_MISSING_OPERATOR', displayPrev, displayCurr));
                        return;
                    }
                }
                prevOperand = token;
            } else {
                if (token === ')') prevOperand = ')';
                else prevOperand = null;
            }
        }

        const funcCallRegex = /(^|[^a-zA-Z0-9_\.])([a-zA-Z_][a-zA-Z0-9_]*)\s*\(/g;
        let match;
        while ((match = funcCallRegex.exec(clean)) !== null) {
            const funcName = match[2].toUpperCase();
            if (RESERVED_WORDS.has(funcName)) continue;
            if (!GLOBAL_FUNCTIONS.has(funcName)) {
                addError(lineNo, t('ERR_UNKNOWN_GLOBAL_FUNC', match[2]));
            }
        }

        const dotFuncRegex = /\.([a-zA-Z_][a-zA-Z0-9_]*)\s*\(/g;
        let dotMatch;
        while ((dotMatch = dotFuncRegex.exec(clean)) !== null) {
            const funcName = dotMatch[1].toUpperCase();
            if (GLOBAL_FUNCTIONS.has(funcName)) {
                addError(lineNo, t('ERR_GLOBAL_FUNC_WITH_DOT', dotMatch[1]));
            }
        }

        const missingPropRegex = /(^|[^a-zA-Z0-9_\.])\s*(LowestObjectTime|CreationUser|Agent|Issuer|Specimen|Order|Object|Person)\b/ig;
        let propMatch;
        while ((propMatch = missingPropRegex.exec(clean)) !== null) {
            addError(lineNo, t('ERR_MISSING_OBJECT_REF', propMatch[2]));
        }

        const operatorPattern = /([=<>!/\\\+\-\*&|]+)/g;
        const foundOperators = clean.match(operatorPattern);
        if (foundOperators) {
            const allowedOperators = new Set(["=", "<", ">", "<=", ">=", "<>", "+", "-", "*", "/", "&&", "||"]);
            foundOperators.forEach(op => {
                if (!allowedOperators.has(op)) {
                    if (op === "!=" || op === "!==") addError(lineNo, t('ERR_OP_NOT_EXISTS_USE_NEQ', op));
                    else if (op === "==") addError(lineNo, t('ERR_OP_NOT_EXISTS_USE_EQ'));
                    else if (op === "=<" || op === "=>") addError(lineNo, t('ERR_OP_REVERSED', op));
                    else addError(lineNo, t('ERR_INVALID_OP', op));
                }
            });
        }

        if (targetVarName) {
            const varType = declaredVars.get(targetVarName.toLowerCase());
            if (varType) {
                let noParens = clean.replace(/\([^()]*\)/g, " ");
                while (/\([^()]*\)/.test(noParens)) noParens = noParens.replace(/\([^()]*\)/g, " ");

                if (varType !== "LOGICAL" && varType !== "BOOLEAN") {
                    const logicMatch = noParens.match(/(=|<>|<|>|<=|>=|\bAND\b|\bOR\b|\bLT\b|\bLE\b|\bGT\b|\bGE\b|\bEQ\b|\bNE\b)/i);
                    if (logicMatch) addError(lineNo, t('ERR_TYPE_NO_LOGIC', targetVarName, varType, logicMatch[1].trim()));
                }
                if (varType === "STRING" && /[\-\*\/]/.test(noParens)) {
                    addError(lineNo, t('ERR_TYPE_NO_MATH_STR', targetVarName));
                } else if (varType === "INTEGER" && /[\/\\]/.test(noParens)) {
                    addError(lineNo, t('ERR_TYPE_NO_DIV_INT', targetVarName));
                }
            }
        }
        
        const isFunctionCallContext = context === t('CTX_FUNC_CALL') || context === "Functie-aanroep";
        const isAssignmentContext = context === t('CTX_ASSIGN_VAL') || context === "Assignment-waarde";
        if (clean.includes(";") && !isFunctionCallContext && !isAssignmentContext) {
           addError(lineNo, t('ERR_SEMI_NOT_ALLOWED', context));
        }
    }

    function stripBlockCommentsFromLine(line, state) {
        if (state.depth === undefined) state.depth = 0;
        let result = "", i = 0;
        while (i < line.length) {
            if (state.depth === 0) {
                if (line.startsWith("/*", i)) { state.depth++; i += 2; result += " "; }
                else { result += line[i]; i++; }
            } else {
                if (line.startsWith("/*", i)) { state.depth++; i += 2; }
                else if (line.startsWith("*/", i)) { state.depth--; i += 2; }
                else i++;
            }
        }
        return result;
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

    function processChunk(chunk, hasSemi, lineNo) {
        const trimmed = chunk.trim();
        if (!trimmed) return;

        if (/^ENDIF\b/i.test(trimmed)) {
            hasExecutableStatement = true;
            const rest = trimmed.substring(5).trim();
            if (rest.length > 0) addError(lineNo, t('ERR_INVALID_SYNTAX_AFTER', rest, "ENDIF"));
            if (hasSemi && chunk.trimEnd().length !== chunk.length) addError(lineNo, t('ERR_SEMI_NO_SPACES'));
            closeBlock("IF", lineNo, "ENDIF");
            body.push({ type: "EndIf", line: lineNo });
            if (!hasSemi) addError(lineNo, t('ERR_MISSING_SEMI_AFTER', "ENDIF"));
            return;
        }

        if (/^DONE\b/i.test(trimmed)) {
            hasExecutableStatement = true;
            const rest = trimmed.substring(4).trim();
            if (rest.length > 0) addError(lineNo, t('ERR_INVALID_SYNTAX_AFTER', rest, "DONE"));
            closeBlock("WHILE", lineNo, "DONE");
            body.push({ type: "Done", line: lineNo });
            if (!hasSemi) addError(lineNo, t('ERR_MISSING_SEMI_AFTER', "DONE"));
            return;
        }

        if (/^ELSE\b/i.test(trimmed)) {
            hasExecutableStatement = true;
            body.push({ type: "Else", line: lineNo });
            const remainder = trimmed.substring(4).trim();
            if (remainder) processChunk(remainder, hasSemi, lineNo);
            return;
        }

        if (/^UNTIL\b/i.test(trimmed)) {
            hasExecutableStatement = true;
            if (closeBlock("REPEAT", lineNo, "UNTIL")) {
                const condition = trimmed.substring(5).trim();
                validateExpression(condition, lineNo, t('CTX_UNTIL_COND'));
                body.push({ type: NodeTypes.GenericStatement, text: "UNTIL " + condition, condition: condition, isUntil: true, line: lineNo });
                if (!hasSemi) addError(lineNo, t('ERR_MISSING_SEMI_AFTER', "UNTIL"));
            }
            return;
        }

        if (/^IF\b/i.test(trimmed)) {
            hasExecutableStatement = true;
            const conditionMatch = trimmed.match(/^IF\b([\s\S]*?)\bTHEN\b/i);
            if (!conditionMatch) { addError(lineNo, t('ERR_IF_WITHOUT_THEN')); return; }
            const condition = conditionMatch[1].trim();
            validateExpression(condition, lineNo, t('CTX_IF_COND'));
            blockStack.push({ type: "IF", line: lineNo });
            body.push({ type: NodeTypes.IfStatement, condition: condition, line: lineNo });
            const afterThen = trimmed.substring(conditionMatch.index + conditionMatch[0].length).trim();
            if (afterThen) processChunk(afterThen, hasSemi, lineNo);
            return;
        }

        if (/^WHILE\b/i.test(trimmed)) {
            hasExecutableStatement = true;
            const conditionMatch = trimmed.match(/^WHILE\b([\s\S]*?)\bDO\b/i);
            if (!conditionMatch) { addError(lineNo, t('ERR_WHILE_WITHOUT_DO')); return; }
            const condition = conditionMatch[1].trim();
            validateExpression(condition, lineNo, t('CTX_WHILE_COND'));
            blockStack.push({ type: "WHILE", line: lineNo });
            body.push({ type: NodeTypes.WhileStatement, condition: condition, line: lineNo });
            const afterDo = trimmed.substring(conditionMatch.index + conditionMatch[0].length).trim();
            if (afterDo) processChunk(afterDo, hasSemi, lineNo);
            return;
        }

        if (/^REPEAT\b/i.test(trimmed)) {
            hasExecutableStatement = true;
            blockStack.push({ type: "REPEAT", line: lineNo });
            body.push({ type: NodeTypes.RepeatStatement, line: lineNo });
            const remainder = trimmed.substring(6).trim();
            if (remainder) processChunk(remainder, hasSemi, lineNo);
            return;
        }

        const stmts = parseSingleStatement(trimmed + (hasSemi ? ";" : ""), lineNo);
        stmts.forEach(s => body.push(s));
    }

    function processSegmentWithKeywords(segText, hasSemi, lineNo) {
        const maskedSeg = segText.replace(/"[^"]*"/g, m => " ".repeat(m.length)).replace(/'[^']*'/g, m => " ".repeat(m.length));
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

        const up = trimmedLast.toUpperCase();
        if ((/^IF\b/i.test(up) && /\bTHEN\b/i.test(up)) || (/^WHILE\b/i.test(up) && /\bDO\b/i.test(up)) || /^REPEAT\b/i.test(up) || /^ELSE\b/i.test(up)) {
            processSegmentWithKeywords(lastSeg, false, lineNo);
            return "";
        }
        return lastSeg;
    }

    function parseSingleStatement(stmt, lineNo) {
        const trimmed = stmt.trim();
        if (!trimmed || trimmed === ";") return [];
        const resultNodes = [];

        if (trimmed.startsWith("/")) { addError(lineNo, t('ERR_INVALID_SLASH')); return []; }

        if (!trimmed.includes(":=") && !trimmed.includes("(") && !/^(IF|WHILE|REPEAT|RETURN|UNTIL|ELSE|ENDIF|DONE|THEN|DO)\b/i.test(trimmed)) {
            const declMatch = /^([a-zA-Z_][a-zA-Z0-9_]*)\s+([^=;]+);$/.exec(trimmed);
            if (declMatch) {
                const typeName = declMatch[1];
                let varListString = declMatch[2].replace(/\/\*[\s\S]*?\*\//g, "");
                if (!new Set(["TRUE", "FALSE", "YES", "NO", "AND", "OR", "NOT"]).has(typeName.toUpperCase())) {
                    
                    if (hasExecutableStatement) {
                        addError(lineNo, t('ERR_DECL_TOO_LATE', typeName));
                    }

                    varListString.split(",").forEach(raw => {
                        const name = raw.trim();
                        if (name.length === 0) addError(lineNo, t('ERR_EMPTY_VAR'));
                        else if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name)) addError(lineNo, t('ERR_INVALID_VAR_CHARS', name));
                        else {
                            const key = name.toLowerCase();
                            if (declaredVars.has(key)) addError(lineNo, t('ERR_VAR_ALREADY_DECL', name));
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

        if (/^RETURN\b/i.test(trimmed)) {
            hasExecutableStatement = true;
            const content = trimmed.substring(6).replace(/;$/, "").trim();
            validateExpression(content, lineNo, t('CTX_RETURN_VAL'));
            return [{ type: NodeTypes.ReturnStatement, expression: content, line: lineNo }];
        }

        if (trimmed.includes(":=")) {
            hasExecutableStatement = true;
            if (!trimmed.endsWith(";")) addError(lineNo, t('ERR_STATEMENT_NEEDS_SEMI'));
            const firstIdx = trimmed.indexOf(":=");
            const name = trimmed.substring(0, firstIdx).trim();
            const value = trimmed.substring(firstIdx + 2).replace(/;$/, "").trim();
            
            if (!/^[a-zA-Z_][a-zA-Z0-9_\.]*$/.test(name)) { 
                addError(lineNo, t('ERR_INVALID_VAR_NAME_SEMI', name)); 
                return []; 
            }
            validateExpression(value, lineNo, t('CTX_ASSIGN_VAL'), name);
            return [{ type: NodeTypes.Assignment, name, value, line: lineNo }];
        }

        if (/^\.?[a-zA-Z_][a-zA-Z0-9_\.]*\(/.test(trimmed.replace(/\s+/g, ''))) {
            hasExecutableStatement = true;
            if (!trimmed.endsWith(";")) {
                addError(lineNo, t('ERR_STATEMENT_NEEDS_SEMI'));
            }
            validateExpression(trimmed, lineNo, t('CTX_FUNC_CALL'));
            return [{ type: NodeTypes.GenericStatement, text: trimmed, line: lineNo }];
        }

        addError(lineNo, t('ERR_UNKNOWN_STATEMENT', trimmed));
        return [];
    }

    // --- MAIN LOOP ---
    const codeLineCount = lines.filter(l => l.trim().length > 0).length;

    for (let i = 0; i < lines.length; i++) {
        let rawLine = lines[i];
        if (!hasFoundFirstCodeLine) {
            const lineTrim = rawLine.trim();
            if (lineTrim.length > 0) {
                hasFoundFirstCodeLine = true;
            }
        }

        let clean = stripBlockCommentsFromLine(rawLine, commentState).trim();
        if (!clean) continue;
        if (/^IF\b.*\;\s*THEN/i.test(clean)) addError(i, t('ERR_SEMI_BETWEEN_IF_THEN'));

        if (lineBuffer) lineBuffer += " " + clean;
        else lineBuffer = clean;
        lineBuffer = processRemainder(lineBuffer, i);
    }

    if (lineBuffer.trim()) processChunk(lineBuffer, false, lines.length - 1);

    blockStack.forEach(open => {
        if (open.type === "REPEAT") addError(open.line - 1, t('ERR_REPEAT_NOT_CLOSED'));
        else addError(open.line - 1, t('ERR_BLOCK_NOT_CLOSED_GENERIC', open.type));
    });

    return { ast: { type: NodeTypes.Program, body: body }, errors: errors, isTextMispl: maskResult.isTextMispl };
}

module.exports = { parseMISPL };