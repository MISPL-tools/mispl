const fs = require('fs');
const path = require('path');

// 🎯 We laden nu ook het VERSION nummer in vanuit dezelfde map!
const { parseMISPL, analyze, VERSION } = require('./analyzeMISPL');

// ⚙️ CONFIGURATIE
const INPUT_FILE = path.join(__dirname, 'gp_SiteFunction.csv'); 
const OUTPUT_FILE = path.join(__dirname, 'test_rapport_SiteFunction.txt');

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

function runBatchTest() {
    // 🎯 We printen de versie in de terminal zodat we het zeker weten!
    console.log(`🚀 Starten met Batch Test (Linter Versie: ${VERSION}) van: ${INPUT_FILE}`);

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

    let totalErrors = 0;
    let scriptsWithErrors = 0;
    let logOutput = "=========================================\n";
    logOutput += `MISPL BATCH TEST RAPPORT - SITE FUNCTIONS\n`;
    logOutput += "=========================================\n\n";

    records.forEach((row, index) => {
        const tableName = row[0] ? row[0].trim() : "OnbekendeTabel";
        const description = row[1] ? row[1].trim() : `Rij ${index + 2}`;
        const misplCode = row[row.length - 1] ? row[row.length - 1].trim() : ""; 

        if (misplCode.length === 0) return;

        try {
            const astResult = parseMISPL(misplCode);
            const errors = analyze(astResult, misplCode);

            const redErrors = errors.filter(e => e.severity === 8);

            if (redErrors.length > 0) {
                scriptsWithErrors++;
                totalErrors += redErrors.length;

                let displayCode = misplCode.trim();
                if (displayCode.startsWith('/*')) {
                    const firstCommentEnd = displayCode.indexOf('*/');
                    if (firstCommentEnd !== -1) {
                        displayCode = `/* ${description} */\n` + displayCode.substring(firstCommentEnd + 2).trimStart();
                    }
                } else {
                    displayCode = `/* ${description} */\n` + displayCode;
                }

                logOutput += `🚨 [${tableName}\t${description}]\n`;
                
                redErrors.forEach(err => {
                    logOutput += `   - Regel ${err.line}: ${err.message}\n`;
                });
                
                logOutput += `\n${displayCode}\n`;
                logOutput += `\n----------------------------------------------------------------------\n\n`;
            }
        } catch (fatalError) {
            logOutput += `💥 FATALE CRASH IN SCRIPT: [${tableName}] - ${description}\n`;
            logOutput += `   Foutmelding: ${fatalError.message}\n\n`;
        }
    });

    logOutput += `=========================================\n`;
    logOutput += `EINDRESULTAAT:\n`;
    logOutput += `- Totaal scripts getest: ${records.length}\n`;
    logOutput += `- Scripts met fouten: ${scriptsWithErrors}\n`;
    logOutput += `- Totaal aantal fouten: ${totalErrors}\n`;
    logOutput += `=========================================\n`;

    fs.writeFileSync(OUTPUT_FILE, logOutput, 'utf8');
    console.log(`✅ Test afgerond! Er zijn ${totalErrors} fouten gevonden verspreid over ${scriptsWithErrors} scripts.`);
    console.log(`📄 Open het rapport: test_rapport_SiteFunction.txt`);
}

runBatchTest();