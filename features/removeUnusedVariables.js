// ./features/removeUnusedVariables.js
const { parseMISPL } = require("../parser");
const { analyze } = require("../analyzer");

function removeUnusedVariablesText(text) {
    if (!text) return "";

    const parseResult = parseMISPL(text);
    const errors = analyze(parseResult, text);

    const unusedVars = [];
    
    // 🛑 DE FIX: Aangepast naar de exacte tekst uit jouw screenshot ("wordt nooit gebruikt")
    const regex = /Variabele '(.+?)' wordt (nooit|niet) gebruikt/i; 

    for (const err of errors) {
        if (err && err.message) {
            const match = err.message.match(regex);
            if (match) {
                unusedVars.push(match[1]); // match[1] is de naam van de variabele
            }
        }
    }

    if (unusedVars.length === 0) {
        return text;
    }

    const lines = text.split(/\r?\n/);
    let inDeclarationBlock = true;

    for (let i = 0; i < lines.length; i++) {
        let line = lines[i];

        if (line.trim() !== "" && !line.trim().startsWith("/*")) {
            if (/:=|\b(IF|WHILE|REPEAT|RETURN)\b/i.test(line)) {
                inDeclarationBlock = false;
            }
        }

        if (inDeclarationBlock && line.trim() !== "" && !line.trim().startsWith("/*")) {
            let cleanLine = line;
            const originalLine = line;

            for (let uv of unusedVars) {
                const varRegex = new RegExp(`\\b${uv}\\b\\s*,?\\s*`, 'g');
                cleanLine = cleanLine.replace(varRegex, '');
            }

            cleanLine = cleanLine.replace(/,\s*,/g, ',');        
            cleanLine = cleanLine.replace(/,\s*;/g, ';');        
            cleanLine = cleanLine.replace(/(\b[a-zA-Z_]\w*\s+),\s*/, '$1'); 

            if (/^[a-zA-Z_]\w*\s*;$/.test(cleanLine.trim())) {
                cleanLine = "";
            }

            if (cleanLine.trim() === "" && originalLine.trim() !== "") {
                lines[i] = null; 
            } else {
                lines[i] = cleanLine;
            }
        }
    }

    return lines.filter(l => l !== null).join('\n');
}

module.exports = removeUnusedVariablesText;