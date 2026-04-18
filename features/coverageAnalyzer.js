// ./features/coverageAnalyzer.js

function generateCoverageReport(misplCode, logText, fileName = "Huidig Script") {
    const codeLines = misplCode.split(/\r?\n/);
    const allMarkers = new Map(); 
    
    // De zoek-machine om de ID's te vinden
    const markerRegex = /\/\*@V\*\/[ \t]*_sV[ \t]*:=[ \t]*_sV[ \t]*\+[ \t]*"([TDER]\d+)\|"[ \t]*;/g;
    
    // Een APARTE zoek-machine om de code schoon te maken (zonder ID capture), 
    // zodat ze elkaars tellers niet in de war sturen en een infinite loop veroorzaken!
    const cleanRegex = /\/\*@V\*\/[ \t]*_sV[ \t]*:=[ \t]*_sV[ \t]*\+[ \t]*"[TDER]\d+\|"[ \t]*;/g;
    
    for (let i = 0; i < codeLines.length; i++) {
        let match;
        // Zorg dat de regex vooraan begint met zoeken op deze regel
        markerRegex.lastIndex = 0;
        
        while ((match = markerRegex.exec(codeLines[i])) !== null) {
            const id = match[1];
            
            // Maak de code netjes leesbaar voor het rapport met de APARTE regex
            let cleanLine = codeLines[i].replace(cleanRegex, "").trim();
            if (cleanLine.length > 85) cleanLine = cleanLine.substring(0, 85) + "...";
            
            allMarkers.set(id, { line: i + 1, code: cleanLine, type: id.charAt(0) });
        }
    }

    const total = allMarkers.size;
    if (total === 0) {
        return "# ⚠️ Fout\nGeen validatie-markers (`/*@V*/...`) gevonden in de code. Zorg dat je de Validation Flow eerst injecteert in dit bestand!";
    }

    // Lees de GLIMS logs uit (kan 1 regel zijn, of 1000 aan elkaar geplakt)
    const executedIds = new Set();
    const logRegex = /([TDER]\d+)\|/g;
    let logMatch;
    while ((logMatch = logRegex.exec(logText)) !== null) {
        executedIds.add(logMatch[1]);
    }

    // Sorteer in 'Uitgevoerd' en 'Nooit uitgevoerd'
    const executed = [];
    const unexecuted = [];

    for (const [id, data] of allMarkers.entries()) {
        if (executedIds.has(id)) {
            executed.push({ id, ...data });
        } else {
            unexecuted.push({ id, ...data });
        }
    }

    const coveragePercent = Math.round((executed.length / total) * 100);

    // Bouw het Markdown rapport
    let report = `# 📊 MISPL Validation Coverage Report\n`;
    report += `**Script:** ${fileName}\n`;
    report += `**Totale beslismomenten in code:** ${total}\n`;
    report += `**Uitgevoerd in GLIMS:** ${executed.length} (${coveragePercent}%)\n`;
    report += `**Nooit uitgevoerd:** ${unexecuted.length} (${100 - coveragePercent}%)\n\n`;
    report += `---\n\n`;

    report += `## 🔴 Dode Code (Nooit uitgevoerd)\n`;
    report += `*Deze paden zijn in géén van de aangeleverde logs voorgekomen.*\n\n`;
    if (unexecuted.length === 0) {
        report += `🎉 **Fantastisch! Alle paden in dit script zijn uitgevoerd in de logs.**\n\n`;
    } else {
        unexecuted.forEach(item => {
            let typeName = getTypeDescription(item.type);
            report += `* **[Regel ${item.line}]** \`${item.code}\` _(${typeName})_\n`;
        });
        report += `\n`;
    }

    report += `## 🟢 Gedekte Code (Succesvol doorlopen)\n`;
    report += `*Deze paden zijn minimaal 1 keer met succes doorlopen.*\n\n`;
    if (executed.length === 0) {
        report += `_Geen enkele marker uit deze code is in de logs gevonden._\n\n`;
    } else {
        executed.forEach(item => {
            let typeName = getTypeDescription(item.type);
            report += `* **[Regel ${item.line}]** \`${item.code}\` _(${typeName})_\n`;
        });
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