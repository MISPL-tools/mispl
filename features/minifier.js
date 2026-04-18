// ./features/minifier.js

const ops = [":=", "<=", ">=", "<>", "+", "-", "*", "/", "=", "<", ">", ",", ";", ":", "(", ")"];
const opRegexPattern = ops.map(op => op.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
const operatorRegex = new RegExp(`\\s*(${opRegexPattern})\\s*`, 'g');
const closerRegex = /^(?:ENDIF|DONE|ELSE|UNTIL)\b/i;

function minifier(text) {
    if (!text) return "";

    const stringMap = new Map();
    let stringCounter = 0;

    // FASE 1: Strings in veiligheid brengen
    let workText = text.replace(/(["'])(?:(?=(\\?))\2.)*?\1/g, (match) => {
        const key = `###STR${stringCounter++}###`;
        stringMap.set(key, match);
        return key;
    });

    // FASE 2: Bescherm de Validatie-tags (/*@V*/)
    workText = workText.replace(/\/\*@V\*\//g, "###VALIDATION_TAG###");

    // FASE 3: Meedogenloze verwijdering van ALLE commentaar
    // Verwijdert single line (//) en multi-line (/* ... */) blokken volledig
    workText = workText.replace(/\/\/[^\r\n]*/g, ""); 
    workText = workText.replace(/\/\*[\s\S]*?\*\//g, "");

    // FASE 4: Slimme Minificatie van de overgebleven code
    const rawLines = workText.split(/\r?\n/);
    const outputLines = [];
    let currentLineBuffer = "";

    for (let i = 0; i < rawLines.length; i++) {
        let line = rawLines[i].trimRight();
        if (!line.trim()) continue;

        const isIndented = /^\s/.test(line); 
        const cleanLine = line.trim(); 
        const isCloser = closerRegex.test(cleanLine);

        if (currentLineBuffer === "") {
            currentLineBuffer = cleanLine;
        } else if (isIndented || isCloser) {
            currentLineBuffer += " " + cleanLine;
        } else {
            outputLines.push(processLine(currentLineBuffer));
            currentLineBuffer = cleanLine;
        }
    }
    
    if (currentLineBuffer) {
        outputLines.push(processLine(currentLineBuffer));
    }

    // FASE 5: Plaats de nieuwe Header, herstel strings en validatie-tags
    let result = "/*Minifier code*/\n" + outputLines.join("\n");

    result = result.replace(/###VALIDATION_TAG###/g, "/*@V*/");
    result = result.replace(/###STR\d+###/g, (match) => {
        return stringMap.get(match) || match;
    });

    return result;
}

function processLine(line) {
    let res = line.replace(/[\r\n\t]+/g, ' ');
    res = res.replace(/\s{2,}/g, ' ');
    res = res.replace(/\b(IF|WHILE|THEN|ELSE|DO|REPEAT|AND|OR|NOT)\b\s*/gi, "$1 ");
    res = res.replace(operatorRegex, "$1");
    res = res.replace(/\b(IF|WHILE|AND|OR|NOT)\(/gi, "$1 (");
    res = res.replace(/\)(THEN|DO|AND|OR|NOT)\b/gi, ") $1");
    return res.trim();
}

module.exports = minifier;