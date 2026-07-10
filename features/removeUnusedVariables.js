const { parseMISPL, analyze } = require("../analyzeMISPL"); 
const { t } = require("../i18n"); 

function removeUnusedVariablesText(text) {
    if (!text) return "";

    // 1. Vraag de AST (linter) om exact te vertellen wat er ongebruikt is
    const parseResult = parseMISPL(text);
    const analysisResult = analyze(parseResult, text);
    const errors = analysisResult.errors || analysisResult; 

    const unusedVars = new Set();
    const unusedTemplate = t('WARN_VAR_DECLARED_NOT_USED', '@@@');
    const unusedParts = unusedTemplate.split('@@@');
    const unusedPrefix = unusedParts[0];
    const unusedSuffix = unusedParts.length > 1 ? unusedParts[1] : '';

    // Verzamel de namen uit de storingsmeldingen
    for (const err of errors) {
        if (err && err.message && 
            err.message.includes(unusedPrefix) && 
            (unusedSuffix === '' || err.message.includes(unusedSuffix))) {
            
            const match = err.message.match(/'([^']+)'/);
            if (match) {
                unusedVars.add(match[1].toLowerCase());
            }
        }
    }

    if (unusedVars.size === 0) return text; // Niets te doen!

    // 2. Loop door de code en verwijder EXACT deze variabelen
    let lines = text.split(/\r?\n/);
    const declRegex = /^(\s*)([a-zA-Z_][a-zA-Z0-9_]*)\s+([a-zA-Z_][a-zA-Z0-9_]*\s*(?:,\s*[a-zA-Z_][a-zA-Z0-9_]*\s*)*);(.*)$/i;
    const reservedKeywords = new Set(["RETURN", "IF", "WHILE", "REPEAT", "UNTIL", "ELSE", "THEN", "DO", "DONE", "ENDIF"]);

    for (let i = 0; i < lines.length; i++) {
        // Gebruik de slimme regex op de hele regel
        const match = declRegex.exec(lines[i]); 

        if (match && !reservedKeywords.has(match[2].toUpperCase())) {
            const indent = match[1] || "";
            const dataType = match[2];
            const varListStr = match[3];
            const suffix = match[4] || "";

            // Splits op komma (met optionele spaties)
            const vars = varListStr.split(/\s*,\s*/).map(v => v.trim()).filter(Boolean);

            // Hou alleen de variabelen over die NIET in het unusedVars lijstje van de linter staan
            const keptVars = vars.filter(v => !unusedVars.has(v.toLowerCase()));

            if (keptVars.length === 0) {
                // Hele regel is nutteloos geworden
                lines[i] = null;
            } else {
                // Herbouw de regel loepzuiver, met exact 1 spatie na elke komma
                lines[i] = `${indent}${dataType} ${keptVars.join(", ")};${suffix}`;
            }
        }
    }

    return lines.filter(l => l !== null).join('\n');
}

module.exports = removeUnusedVariablesText;