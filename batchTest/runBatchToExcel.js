const fs = require('fs');
const path = require('path');

// 🎯 We laden de linter logica in
const { parseMISPL, analyze, VERSION } = require('./analyzeMISPL');

// ⚙️ CONFIGURATIE
const INPUT_FILE = path.join(__dirname, 'gp_SiteFunction.csv'); 
// Tip: We noemen het nu een .txt bestand. Excel snapt tabs veel beter uit een .txt!
const OUTPUT_CSV = path.join(__dirname, 'MISPL_Corvee_Lijst.csv');

// 🧠 DE SPECIALE GLIMS EXPORT PARSER
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

function runBatchToCSV() {
    console.log(`🚀 Starten Batch naar Excel/TAB (Linter Versie: ${VERSION})`);

    if (!fs.existsSync(INPUT_FILE)) {
        console.error(`❌ FOUT: Kan bestand niet vinden op: ${INPUT_FILE}`);
        return;
    }

    const rawData = fs.readFileSync(INPUT_FILE, 'utf8');
    const records = extractGLIMSData(rawData);

    if (records.length > 0 && records[0][0].includes("Table.Name")) {
        records.shift(); 
    }

    // 🛑 \uFEFF is de UTF-8 BOM, dit forceert Excel om het correct te lezen.
    // 🛑 \t is de TAB codering.
    let csvOutput = "\uFEFFNiveau\tMelding\tScriptNaam\tLocatie\n";

    records.forEach((row, index) => {
        // GLIMS-METADATA FILTER: Sla rijen over die beginnen met '%'
        if (row[0] && row[0].trim().startsWith('%')) return;

        const misplCode = row[row.length - 1] ? row[row.length - 1].trim() : ""; 
        
        if (misplCode.length === 0 || misplCode.startsWith('%')) return;

        // Smart Script Naam Detectie
        let scriptName = row[1] ? row[1].trim() : "";
        if (!scriptName && row[0] && !row[0].includes("SiteFunction")) {
            scriptName = row[0].trim();
        }
        if (!scriptName) {
            const commentMatch = misplCode.match(/^\/\*\s*(.*?)\s*\*\//);
            if (commentMatch && commentMatch[1]) {
                scriptName = commentMatch[1].trim();
            } else {
                scriptName = `Onbekend_Rij_${index + 2}`;
            }
        }

        try {
            const astResult = parseMISPL(misplCode);
            const issues = analyze(astResult, misplCode);

            issues.forEach(issue => {
                let niveau = "Stijl-tip";
                if (issue.severity === 8) niveau = "Fout";
                else if (issue.severity === 4) niveau = "Waarschuwing";

                // 🛑 Verwijder specifieke emoji's die de linter toevoegt
                let melding = issue.message.replace(/[❌⚠️💡👮🐢🚨]/g, "").trim();
                
                // Extra opschonen voor Excel
                melding = melding.replace(/\n/g, " ");

                const locatie = `Regel ${issue.line}`;

                // Gebruik \t (TAB) in plaats van de pipe (|)
                csvOutput += `${niveau}\t${melding}\t${scriptName}\t${locatie}\n`;
            });

        } catch (fatalError) {
            csvOutput += `CRASH\tFATALE CRASH IN PARSER: ${fatalError.message}\t${scriptName}\tAlgemeen\n`;
        }
    });

    fs.writeFileSync(OUTPUT_CSV, csvOutput, 'utf8');
    console.log(`✅ Bestand gegenereerd: ${OUTPUT_CSV}`);
}

runBatchToCSV();