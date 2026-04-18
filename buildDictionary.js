const fs = require('fs');
const path = require('path');

// ⚙️ CONFIGURATIE
const SNIPPETS_FILE = path.join(__dirname, 'snippets', 'mispl.code-snippets'); 
let FIELDS_FILE = path.join(__dirname, 'fields.txt');
if (!fs.existsSync(FIELDS_FILE)) {
    FIELDS_FILE = path.join(__dirname, 'snippets', 'fields.txt');
}
const OUTPUT_FILE = path.join(__dirname, 'features', 'glimsDictionary.json');

// 🧠 ALIAS VERTALER
const ALIAS_MAP = {
    "ORD": "ORDER", "ORDR": "ORDER", "RSLT": "RESULT", "OBJ": "OBJECT",
    "SPMN": "SPECIMEN", "PRSN": "PERSON", "CRSP": "CORRESPONDENT",
    "ACTN": "MICROBIOLOGYACTION", "APPR": "APPROACH", "MAT": "MATERIAL",
    "RQST": "REQUEST", "SMP": "SAMPLE", "ENCR": "ENCOUNTER",
    "DEPT": "DEPARTMENT", "USR": "USER", "HCRD": "HEALTHCARECORD",
    "ISSR": "ISSUER", "AGNT": "AGENT"
};

function resolveTableName(rawName) {
    let upperName = rawName.toUpperCase();
    return ALIAS_MAP[upperName] || upperName;
}

// 🧠 DATATYPE VERTALER
function mapDataType(rawType) {
    let t = String(rawType).toUpperCase().trim();
    if (t === "INT64" || t.includes("INT") || t === "POSITIVEINTEGER" || t === "POSITIVE" || t === "RECORD") return "INTEGER";
    if (t === "DECIMAL" || t === "NUM" || t.includes("FRAC")) return "FRACTIONAL";
    if (t === "BOOL" || t === "BOOLEAN") return "LOGICAL";
    if (t === "CHAR" || t === "LOGSEVERITY") return "STRING"; 
    return t; 
}

function buildDictionary() {
    console.log(`🚀 Starten met bouwen van GLIMS Dictionary...`);

    const dictionary = { globals: {}, tables: {} };
    let funcCount = 0, fieldCount = 0, skippedCount = 0;
    let totalPipesInSnippets = 0;
    let appliedOptionalCount = 0;

    // ==========================================
    // DEEL 1: MISPL.CODE-SNIPPETS INLEZEN
    // ==========================================
    if (fs.existsSync(SNIPPETS_FILE)) {
        const rawData = fs.readFileSync(SNIPPETS_FILE, 'utf8');
        try {
            let cleanData = rawData.replace(/^\uFEFF/, ''); 
            cleanData = cleanData.replace(/\/\*[\s\S]*?\*\//g, ''); 
            cleanData = cleanData.replace(/\/\/.*/g, ''); 
            cleanData = cleanData.replace(/,(?=\s*[}\]])/g, ''); 
            
            const startIndex = cleanData.indexOf('{');
            const endIndex = cleanData.lastIndexOf('}');
            if (startIndex !== -1 && endIndex !== -1) {
                cleanData = cleanData.substring(startIndex, endIndex + 1);
            }
            const snippets = JSON.parse(cleanData);

            for (const [snippetName, snippetData] of Object.entries(snippets)) {
                const description = snippetData.description || "";
                const firstLine = description.split('\n')[0].trim();
                
                // Plak de body array (als het een array is) aan elkaar tot 1 string
                const bodyText = Array.isArray(snippetData.body) ? snippetData.body.join(' ') : snippetData.body || "";

                // Zoek alle ${1:naam|?} tags en sla per positie op of er |? achter stond
                const isOptionalByIndex = [];
                let maxBodyIndex = -1;
                const bodyParamRegex = /\$\{([0-9]+):([^}]+)\}/g;
                let bMatch;
                let localPipeCount = 0;
                
                while ((bMatch = bodyParamRegex.exec(bodyText)) !== null) {
                    const pos = parseInt(bMatch[1], 10) - 1; // Nummering in snippets start bij 1
                    if (pos > maxBodyIndex) maxBodyIndex = pos;
                    if (bMatch[2].includes('|?')) {
                        isOptionalByIndex[pos] = true;
                        localPipeCount++;
                        totalPipesInSnippets++;
                    }
                }

                const funcRegex = /^(?:([A-Za-z0-9_]+(?:\|\?)?)\s+)?(?:([A-Za-z0-9_]+)\.)?([A-Za-z0-9_]+)\s*\(([^)]*)\)/;
                const funcMatch = firstLine.match(funcRegex);

                if (funcMatch) {
                    const returnType = mapDataType((funcMatch[1] || "UNKNOWN").replace('|?', ''));
                    const callerRaw = funcMatch[2]; 
                    const funcName = funcMatch[3].toUpperCase(); 
                    const paramString = funcMatch[4];

                    // Bepaal de basis-types vanuit de Description
                    let parsedTypes = [];
                    if (paramString && paramString.trim() !== "" && !paramString.includes("...")) {
                        const rawParams = paramString.split(',');
                        for (let i = 0; i < rawParams.length; i++) {
                            let clean = rawParams[i].trim();
                            let typeMatch = clean.match(/^[\[\s]*([A-Za-z0-9_]+(?:\|\?)?)/);
                            if (typeMatch) {
                                let rawType = typeMatch[1];
                                let isOptionalDesc = rawType.endsWith('|?') || clean.toLowerCase().includes('optional') || clean.includes('[');
                                let baseType = mapDataType(rawType.replace('|?', ''));
                                parsedTypes[i] = isOptionalDesc ? baseType + "|?" : baseType;
                            } else {
                                parsedTypes[i] = "ANY";
                            }
                        }
                    }

                    // SMELT BODY EN DESCRIPTION SAMEN
                    const totalParams = Math.max(parsedTypes.length, maxBodyIndex + 1);
                    const finalParams = [];
                    for (let i = 0; i < totalParams; i++) {
                        let type = parsedTypes[i] || "ANY"; // Fallback naar ANY als de description 'lui' is
                        
                        // Als de body hem markeerde als |?, plak het eraan vast
                        if (isOptionalByIndex[i] === true && !type.endsWith('|?')) {
                            type = type + "|?";
                        }
                        finalParams.push(type);
                    }

                    // Dynamisch de minParams bepalen (Hoeveel moet je minimaal invullen?)
                    let minParams = 0;
                    for (let i = 0; i < finalParams.length; i++) {
                        if (!finalParams[i].endsWith('|?')) {
                            minParams = i + 1; // Als parameter 3 vereist is, moet je er minimaal 3 invullen
                        }
                    }
                    if (paramString.includes('Optional') || paramString.includes('[')) {
                        // Trust global optional flags if present
                    }

                    if (callerRaw) {
                        const tableName = resolveTableName(callerRaw);
                        if (!dictionary.tables[tableName]) dictionary.tables[tableName] = {};
                        dictionary.tables[tableName][funcName] = { params: finalParams, minParams: minParams, returns: returnType, type: "Method" };
                    } else {
                        dictionary.globals[funcName] = { params: finalParams, minParams: minParams, returns: returnType, type: "Function" };
                    }
                    funcCount++;
                    appliedOptionalCount += localPipeCount;
                } else {
                    // Als hij wordt overgeslagen, check of er wel |? tags in stonden
                    if (localPipeCount > 0) {
                        console.log(`⚠️ Snippet overgeslagen: '${snippetName}' (Bevatte ${localPipeCount}x '|?', maar 'description' was geen geldige Functie-blauwdruk)`);
                    }
                    skippedCount++;
                }
            }
        } catch (e) {
            console.error(`❌ FOUT bij inlezen snippets JSON: ${e.message}`);
        }
    }

    // ==========================================
    // DEEL 2: FIELDS.TXT INLEZEN
    // ==========================================
    if (fs.existsSync(FIELDS_FILE)) {
        const fieldsData = fs.readFileSync(FIELDS_FILE, 'utf8');
        const lines = fieldsData.split(/\r?\n/);
        
        for (let i = 1; i < lines.length; i++) { 
            const line = lines[i].trim();
            if (!line) continue;

            const parts = line.split(';');
            if (parts.length >= 3) {
                const rawTableName = parts[0].trim();
                const rawFieldName = parts[1].trim();
                const rawDataType = parts[2].trim();

                const tableName = resolveTableName(rawTableName);
                const fieldName = rawFieldName.replace(/^[a-zA-Z0-9]+_/, '').toUpperCase();
                const returnType = mapDataType(rawDataType);

                if (!dictionary.tables[tableName]) dictionary.tables[tableName] = {};
                if (!dictionary.tables[tableName][fieldName]) {
                    dictionary.tables[tableName][fieldName] = { returns: returnType, type: "Field" };
                    fieldCount++;
                }
            }
        }
    }

    // Output schrijven (Alle overrides zijn verwijderd, jouw Snippets zijn de baas!)
    const dir = path.dirname(OUTPUT_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(dictionary, null, 2), 'utf8');

    console.log(`\n✅ SUCCES! glimsDictionary.json is gebouwd.`);
    console.log(`📊 Statistieken:`);
    console.log(`   - Functies toegevoegd: ${funcCount}`);
    console.log(`   - Velden (Fields) toegevoegd: ${fieldCount}`);
    console.log(`   - Snippets overgeslagen: ${skippedCount}`);
    console.log(`   - Totaal '|?' markers in snippets: ${totalPipesInSnippets}`);
    console.log(`   - Waarvan succesvol in linter gezet: ${appliedOptionalCount}`);
    
    if (totalPipesInSnippets > appliedOptionalCount) {
        console.log(`\n⚠️ Let op: Enkele '|?' markers zijn verloren gegaan. Dit gebeurt als de 'description' van die snippet niet het standaard "Functie(Parameter)" formaat heeft. Pas de description in je snippet aan als je wilt dat de linter deze ook snapt!`);
    }
}

buildDictionary();