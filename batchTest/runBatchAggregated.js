const fs = require('fs');
const path = require('path');

// 🎯 We laden het VERSION nummer in vanuit dezelfde map
const { parseMISPL, analyze, VERSION } = require('./analyzeMISPL');

// ⚙️ CONFIGURATIE
const INPUT_FILE = path.join(__dirname, 'gp_SiteFunction.csv'); 
const OUTPUT_FILE = path.join(__dirname, 'test_rapport_Geaggregeerd.txt');

// 🧠 DE SPECIALE GLIMS EXPORT PARSER (Met Auto-Detectie)
function extractGLIMSData(rawText) {
    let delimiter = ',';
    const firstLine = rawText.substring(0, rawText.indexOf('\n') || 100);
    if (firstLine.includes('\t')) delimiter = '\t';
    else if (firstLine.includes(';')) delimiter = ';';
    
    console.log(`🔍 Auto-detect scheidingsteken: '${delimiter === '\t' ? 'TAB' : delimiter}'`);

    const records = [];
    let currentRecord = [];
    let currentCell = "";
    let inQuotes = false;

    for (let i = 0; i < rawText.length; i++) {
        let char = rawText[i];
        let nextChar = rawText[i + 1];

        if (inQuotes) {
            if (char === '"' && nextChar === '"') {
                currentCell += '"';
                i++; 
            } else if (char === '"') {
                inQuotes = false;
            } else {
                currentCell += char;
            }
        } else {
            if (char === '"') {
                inQuotes = true;
            } else if (char === delimiter) {
                currentRecord.push(currentCell);
                currentCell = "";
            } else if (char === '\n' || (char === '\r' && nextChar === '\n')) {
                currentRecord.push(currentCell);
                if (currentRecord.some(c => c.trim() !== "")) {
                    records.push(currentRecord);
                }
                currentRecord = [];
                currentCell = "";
                if (char === '\r') i++; 
            } else {
                currentCell += char;
            }
        }
    }
    if (currentCell || currentRecord.length > 0) {
        currentRecord.push(currentCell);
        if (currentRecord.some(c => c.trim() !== "")) records.push(currentRecord);
    }
    return records;
}

// 🧹 Helper functie om variabelenamen/regelnummers uit meldingen te filteren voor groepering
function getBaseMessage(message) {
    let base = message;
    // Verwijder specifieke variabelenamen (tussen aanhalingstekens)
    base = base.replace(/'[^']+'/g, "'[NAAM]'");
    // Verwijder specifieke regelnummers of foutieve stukjes code in de melding
    base = base.replace(/\(\'.*?\'\)/g, "('[CODE]')");
    base = base.replace(/type [A-Z]+/gi, "type [TYPE]");
    return base;
}

function runBatchTest() {
    console.log(`🚀 Starten met Geaggregeerde Batch Test (Linter Versie: ${VERSION}) van: ${INPUT_FILE}`);

    if (!fs.existsSync(INPUT_FILE)) {
        console.error(`❌ FOUT: Kan bestand niet vinden op: ${INPUT_FILE}`);
        return;
    }

    const rawData = fs.readFileSync(INPUT_FILE, 'utf8');
    console.log(`⏳ Bezig met pellen en un-escapen van de GLIMS export...`);
    const records = extractGLIMSData(rawData);

    if (records.length > 0 && records[0][0].includes("Table.Name")) {
        records.shift(); 
    }

    console.log(`📦 ${records.length} MISPL scripts netjes uitgepakt. Analyseren...`);

    // Dictionaries voor groepering
    // Structuur: { "Basis Foutmelding": [ "ScriptNaam1 (Regel X)", "ScriptNaam2 (Regel Y)" ] }
    const groupedErrors = {};
    const groupedWarnings = {};
    const groupedTips = {};

    let totalScriptsWithAnyIssue = 0;

    records.forEach((row, index) => {
        const description = row[1] ? row[1].trim() : `Rij_${index + 2}`;
        const misplCode = row[row.length - 1] ? row[row.length - 1].trim() : ""; 

        if (misplCode.length === 0) return;

        try {
            const astResult = parseMISPL(misplCode);
            const issues = analyze(astResult, misplCode);

            if (issues.length > 0) totalScriptsWithAnyIssue++;

            issues.forEach(issue => {
                // Schoon de melding op voor betere groepering
                const baseMsg = getBaseMessage(issue.message);
                const location = `${description} (Regel ${issue.line})`;

                if (issue.severity === 8) {
                    if (!groupedErrors[baseMsg]) groupedErrors[baseMsg] = new Set();
                    groupedErrors[baseMsg].add(location);
                } else if (issue.severity === 4) {
                    if (!groupedWarnings[baseMsg]) groupedWarnings[baseMsg] = new Set();
                    groupedWarnings[baseMsg].add(location);
                } else if (issue.severity === 2) {
                    if (!groupedTips[baseMsg]) groupedTips[baseMsg] = new Set();
                    groupedTips[baseMsg].add(location);
                }
            });

        } catch (fatalError) {
            const fatalMsg = "💥 FATALE CRASH IN PARSER";
            if (!groupedErrors[fatalMsg]) groupedErrors[fatalMsg] = new Set();
            groupedErrors[fatalMsg].add(`${description} (${fatalError.message})`);
        }
    });

    // 📄 Rapport Genereren
    let logOutput = "========================================================================\n";
    logOutput += ` MISPL CORVEE RAPPORT - GEAGGREGEERD (Versie: ${VERSION})\n`;
    logOutput += "========================================================================\n\n";

    // Hulpfunctie om secties uit te schrijven
    const writeSection = (title, groupedData, icon) => {
        const keys = Object.keys(groupedData).sort((a, b) => groupedData[b].size - groupedData[a].size);
        if (keys.length === 0) return;

        logOutput += `\n${title}\n`;
        logOutput += `------------------------------------------------------------------------\n`;
        
        keys.forEach(baseMsg => {
            const scriptsArray = Array.from(groupedData[baseMsg]);
            logOutput += `${icon} ${baseMsg}\n`;
            
            // Format de lijst van scripts mooi (max 8 per regel voor leesbaarheid)
            let scriptList = "   In MISPLs: ";
            for (let i = 0; i < scriptsArray.length; i++) {
                scriptList += scriptsArray[i];
                if (i < scriptsArray.length - 1) scriptList += ", ";
                if ((i + 1) % 5 === 0) scriptList += "\n              "; // nieuwe regel uitlijning
            }
            logOutput += `${scriptList}\n\n`;
        });
    };

    writeSection("🔴 ERRORS (Kritiek, blokkeert vaak in GLIMS)", groupedErrors, "❌");
    writeSection("🟡 WAARSCHUWINGEN (Mogelijke bugs of dode code)", groupedWarnings, "⚠️");
    writeSection("🔵 STIJL-TIPS (Optimalisatie & Naming Conventions)", groupedTips, "💡");

    logOutput += `========================================================================\n`;
    logOutput += `EINDRESULTAAT:\n`;
    logOutput += `- Totaal scripts geanalyseerd: ${records.length}\n`;
    logOutput += `- Scripts met minimaal 1 opmerking: ${totalScriptsWithAnyIssue}\n`;
    logOutput += `========================================================================\n`;

    fs.writeFileSync(OUTPUT_FILE, logOutput, 'utf8');
    console.log(`✅ Geaggregeerd Test Rapport afgerond! Check: test_rapport_Geaggregeerd.txt`);
}

runBatchTest();