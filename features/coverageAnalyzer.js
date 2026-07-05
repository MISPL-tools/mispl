// ./features/coverageAnalyzer.js
const { t } = require("../i18n"); // 🌍 Importeer de vertaalfunctie

function generateCoverageReport(misplCode, logText, fileName = "Huidig Script") {
    const codeLines = misplCode.split(/\r?\n/);
    const allMarkers = new Map(); 
    
    // 🚀 DE FIX: We maken de /*@V*/ tag optioneel met (?:\/\*@V\*\/\s*)?
    // Zo herkent hij het ZOWEL in je originele code als in je geminificeerde code!
    const markerRegex = /(?:\/\*@V\*\/\s*)?_sV\s*:=\s*_sV\s*\+\s*"([TDER]\d+)\|"\s*;/g;
    
    // De APARTE zoek-machine om de code schoon te maken
    const cleanRegex = /(?:\/\*@V\*\/\s*)?_sV\s*:=\s*_sV\s*\+\s*"[TDER]\d+\|"\s*;/g;
    
    for (let i = 0; i < codeLines.length; i++) {
        let match;
        markerRegex.lastIndex = 0;
        
        while ((match = markerRegex.exec(codeLines[i])) !== null) {
            const id = match[1];
            
            // Maak de code netjes leesbaar voor het rapport
            let cleanLine = codeLines[i].replace(cleanRegex, "").trim();
            if (cleanLine.length > 85) cleanLine = cleanLine.substring(0, 85) + "...";
            
            allMarkers.set(id, { line: i + 1, code: cleanLine, type: id.charAt(0) });
        }
    }

    const total = allMarkers.size;
    if (total === 0) {
        return t('COV_ERR_NO_MARKERS');
    }

    // Chronologisch uitlezen van de GLIMS logs
    const chronologicalPath = []; 
    const executedIds = new Set(); 
    
    const logRegex = /([TDER]\d+)\|/g;
    let logMatch;
    while ((logMatch = logRegex.exec(logText)) !== null) {
        chronologicalPath.push(logMatch[1]);
        executedIds.add(logMatch[1]);
    }

    // Bepaal de 'Dode code' voor deze specifieke run
    const unexecuted = [];
    for (const [id, data] of allMarkers.entries()) {
        if (!executedIds.has(id)) {
            unexecuted.push({ id, ...data });
        }
    }

    const coveragePercent = Math.round((executedIds.size / total) * 100);

    // Bouw het Markdown rapport via de i18n vertalingen
    let report = t('COV_REP_TITLE');
    report += t('COV_REP_SCRIPT', fileName);
    report += t('COV_REP_TOTAL', total);
    report += t('COV_REP_STEPS', chronologicalPath.length);
    report += t('COV_REP_UNIQUE', executedIds.size, coveragePercent);
    report += `---\n\n`;

    report += t('COV_REP_ROUTE_TITLE');
    report += t('COV_REP_ROUTE_DESC');

    if (chronologicalPath.length === 0) {
        report += t('COV_REP_ROUTE_EMPTY');
    } else {
        let stepCounter = 1;
        chronologicalPath.forEach(id => {
            if (allMarkers.has(id)) {
                const item = allMarkers.get(id);
                let typeName = getTypeDescription(item.type);
                report += t('COV_REP_ROUTE_ITEM', stepCounter, item.line, item.code, typeName);
            } else {
                report += t('COV_REP_ROUTE_UNKNOWN', stepCounter, id);
            }
            stepCounter++;
        });
        report += `\n`;
    }

    report += `---\n\n`;
    report += t('COV_REP_MISSED_TITLE');
    report += t('COV_REP_MISSED_DESC');
    
    if (unexecuted.length === 0) {
        report += t('COV_REP_MISSED_EMPTY');
    } else {
        unexecuted.forEach(item => {
            let typeName = getTypeDescription(item.type);
            report += t('COV_REP_MISSED_ITEM', item.line, item.code, typeName);
        });
        report += `\n`;
    }

    return report;
}

function getTypeDescription(char) {
    if (char === 'T') return "THEN";
    if (char === 'E') return "ELSE";
    if (char === 'D') return "WHILE / DO";
    if (char === 'R') return "REPEAT / UNTIL";
    return t('COV_TYPE_LOGIC');
}

module.exports = { generateCoverageReport };