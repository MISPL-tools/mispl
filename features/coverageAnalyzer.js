// ./features/coverageAnalyzer.js

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
        return "# ⚠️ Fout\nGeen validatie-markers (`_sV:=_sV+...`) gevonden in de code. Zorg dat je de Validation Flow eerst injecteert in dit bestand!";
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

    // Bouw het Markdown rapport
    let report = `# 🗺️ MISPL Kruimelspoor (Chronologisch)\n`;
    report += `**Script:** ${fileName}\n`;
    report += `**Totale beslismomenten in code:** ${total}\n`;
    report += `**Aantal stappen in deze run:** ${chronologicalPath.length}\n`;
    report += `**Unieke paden geraakt:** ${executedIds.size} (${coveragePercent}%)\n\n`;
    report += `---\n\n`;

    report += `## 📍 Gevolgde Route (Stap-voor-stap)\n`;
    report += `*Deze stappen heeft de MISPL in exacte chronologische volgorde doorlopen voor dit specifieke monster.*\n\n`;

    if (chronologicalPath.length === 0) {
        report += `_Geen log-data gevonden of de run heeft geen enkel beslismoment geraakt._\n\n`;
    } else {
        let stepCounter = 1;
        chronologicalPath.forEach(id => {
            if (allMarkers.has(id)) {
                const item = allMarkers.get(id);
                let typeName = getTypeDescription(item.type);
                report += `${stepCounter}. **[Regel ${item.line}]** \`${item.code}\` _(${typeName})_\n`;
            } else {
                report += `${stepCounter}. ⚠️ **[Onbekende Tag: ${id}]** _(Is de code gewijzigd na injectie?)_\n`;
            }
            stepCounter++;
        });
        report += `\n`;
    }

    report += `---\n\n`;
    report += `## 🔕 Overgeslagen Beslismomenten\n`;
    report += `*Deze paden zijn voor dit monster **niet** geraakt (bijv. IF was FALSE of lus werd overgeslagen).*\n\n`;
    
    if (unexecuted.length === 0) {
        report += `🎉 **Fantastisch! Alle paden in dit script zijn uitgevoerd.**\n\n`;
    } else {
        unexecuted.forEach(item => {
            let typeName = getTypeDescription(item.type);
            report += `* **[Regel ${item.line}]** \`${item.code}\` _(${typeName})_\n`;
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
    return "Logica";
}

module.exports = { generateCoverageReport };