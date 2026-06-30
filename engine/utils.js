const isDefaultValue = (val, type) => {
    const t = type.toUpperCase();
    if (t === "<INTEGER>") return val === "0";
    if (t === "<FRACTIONAL>") return val === "0" || val === "0.0";
    if (t === "<STRING>") return val === "" || val === "<EMPTY_STRING>";
    if (t === "<LOGICAL>") return val === "FALSE";
    if (t === "<DATE>" || t === "<TIME>" || t === "<DATETIME>") return val === "?" || val === "";
    return false;
};

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
            if (c === '/' && next === '*') { depth++; i += 2; }
            else if (c === '"' || c === "'") { inString = true; stringChar = c; result += c; i++; }
            else { result += c; i++; }
        } else if (inString) {
            if (c === stringChar) {
                if (next === stringChar) { result += c + next; i += 2; }
                else { inString = false; result += c; i++; }
            } else { result += c; i++; }
        } else if (depth > 0) {
            if (c === '/' && next === '*') { depth++; i += 2; }
            else if (c === '*' && next === '/') { depth--; i += 2; }
            else { i++; }
        }
    }
    return result;
}

function maskTextMispl(code) {
    let clean = removeCommentsDepthAware(code).replace(/"(?:[^"]|"")*"/g, '').replace(/'(?:[^']|'')*'/g, '');
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
    let isTextMispl = hasBraceBlock || (!hasReturn && !hasAssignment && !startsWithComment);

    if (!isTextMispl) return { masked: code, isTextMispl: false, errors: [], trailingWarning: null };

    let masked = "", mode = "TEXT", inBlockString = false, inBlockComment = false, blockStringQuote = '', errors = [], lastClosingBraceIndex = -1;
    for (let i = 0; i < code.length; i++) {
        const char = code[i];
        if (mode === "TEXT") {
            const isEscaped = (i > 0 && code[i-1] === '~');
            if (char === '{' && !isEscaped) {
                const remainder = code.substring(i + 1);
                if (remainder.startsWith(':')) { mode = "PROG"; masked += '  '; i++; }
                else if (remainder.startsWith('=') || remainder.startsWith('<')) { mode = "EXPR"; masked += '  '; i++; }
                else if (/^\s*\/\*/.test(remainder)) { mode = "PROG"; masked += ' '; }
                else { errors.push({ index: i, msg: "FOUT: Vergeten dubbele punt of onjuiste '{'." }); masked += ' '; }
            } else { masked += (char === '\n' || char === '\r') ? char : ' '; }
        } else if (mode === "EXPR") {
            if (char === '}') { mode = "TEXT"; lastClosingBraceIndex = i; }
            masked += (char === '\n' || char === '\r') ? char : ' ';
        } else if (mode === "PROG") {
            if (!inBlockString && !inBlockComment) {
                if (char === '/' && code[i+1] === '*') { inBlockComment = true; masked += '/*'; i++; }
                else if (char === '"' || char === "'") { inBlockString = true; blockStringQuote = char; masked += char; }
                else if (char === '}') { mode = "TEXT"; lastClosingBraceIndex = i; masked += ' '; }
                else { masked += char; }
            } else if (inBlockString) {
                if (char === blockStringQuote) {
                    if (i + 1 < code.length && code[i+1] === blockStringQuote) { masked += char + code[i+1]; i++; }
                    else { inBlockString = false; masked += char; }
                } else { masked += char; }
            } else if (inBlockComment) {
                if (char === '*' && code[i+1] === '/') { inBlockComment = false; masked += '*/'; i++; }
                else { masked += char; }
            }
        }
    }
    
    let trailingWarning = null;
    if (lastClosingBraceIndex !== -1 && mode === "TEXT") {
        const afterLastBrace = code.substring(lastClosingBraceIndex + 1);
        if (afterLastBrace.length > 0 && /^\s+$/.test(afterLastBrace)) {
            trailingWarning = "💡 INFO: Er staan nog onzichtbare tekens na de allerlaatste '}'. Verwijder ze voor een schone output.";
        }
    }
    
    return { masked, isTextMispl: true, errors, trailingWarning };
}

function getMaskedForKeywords(text) {
    let masked = "", parenDepth = 0, squareDepth = 0, inQuote = false, quoteChar = '';
    for (let i = 0; i < text.length; i++) {
        let c = text[i];
        if (!inQuote && (c === '"' || c === "'")) { inQuote = true; quoteChar = c; masked += '"'; }
        else if (inQuote) {
            if (c === quoteChar) {
                if (i + 1 < text.length && text[i + 1] === quoteChar) { masked += '  '; i++; }
                else { inQuote = false; masked += '"'; }
            } else { masked += ' '; }
        } else {
            if (c === '[') { squareDepth++; masked += '['; }
            else if (c === ']') { squareDepth--; masked += ']'; }
            else if (c === '(') { if (parenDepth === 0) masked += '('; else masked += ' '; parenDepth++; }
            else if (c === ')') { parenDepth--; if (parenDepth === 0) masked += ')'; else masked += ' '; }
            else if (parenDepth > 0 || squareDepth > 0) { masked += ' '; }
            else { masked += c; }
        }
    }
    return masked;
}

function isStatementComplete(text) {
    let p = 0, s = 0, inQ = false, q = '';
    for (let i = 0; i < text.length; i++) {
        const c = text[i];
        if (!inQ && (c === '"' || c === "'")) { inQ = true; q = c; } 
        else if (inQ) {
            if (c === q) {
                if (i + 1 < text.length && text[i + 1] === q) i++;
                else inQ = false;
            }
        } else {
            if (c === '(') p++; else if (c === ')') p--; else if (c === '[') s++; else if (c === ']') s--;
        }
    }
    return p <= 0 && s <= 0 && !inQ;
}

module.exports = { isDefaultValue, removeCommentsDepthAware, maskTextMispl, getMaskedForKeywords, isStatementComplete };