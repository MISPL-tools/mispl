const fs = require('fs');
const path = require('path');

// ⚙️ CONFIGURATIE
const SNIPPETS_FILE = path.join(__dirname, 'snippets', 'mispl.code-snippets');
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
    const upperName = rawName.toUpperCase();
    return ALIAS_MAP[upperName] || upperName;
}

// 🧠 DATATYPE VERTALER (Naar GLIMS standaarden)
function mapDataType(rawType) {
    let t = rawType.toUpperCase();
    if (t.includes("INT") || t === "POSITIVEINTEGER") return "INTEGER";
    if (t.includes("FRAC") || t === "DECIMAL" || t === "NUM") return "FRACTIONAL";
    if (t === "BOOL" || t === "BOOLEAN") return "LOGICAL";
    if (t === "CHAR" || t === "MNEMONIC") return "STRING"; // Mnemonic als string behandelen voor de checker
    if (["STRING", "LOGICAL", "DATE", "TIME", "DATETIME", "ANY"].includes(t)) return t;
    return "ANY"; // Fallback als we het type niet kennen
}

function parseParameters(paramString) {
    if (!paramString || paramString.trim() === "" || paramString.includes("...")) return ["ANY"];
    
    const rawParams = paramString.split(',');
    const parsedTypes = [];

    for (let p of rawParams) {
        let clean = p.trim();
        let typeMatch = clean.match(/^([A-Za-z0-9_]+)/);
        if (typeMatch) {
            let baseType = mapDataType(typeMatch[1]);
            // Voeg standaard de |? modifier toe, omdat GLIMS '?' vaak toestaat
            parsedTypes.push(baseType + "|?");
        } else {
            parsedTypes.push("ANY");
        }
    }
    return parsedTypes;
}

function buildDictionary() {
    console.log(`🚀 Starten met bouwen van GLIMS Dictionary...`);

    if (!fs.existsSync(SNIPPETS_FILE)) {
        console.error(`❌ FOUT: Kan snippet bestand niet vinden op: ${SNIPPETS_FILE}`);
        return;
    }

    const rawData = fs.readFileSync(SNIPPETS_FILE, 'utf8');
    let snippets;
    try {
        snippets = JSON.parse(rawData);
    } catch (e) {
        console.error(`❌ FOUT bij inlezen snippets JSON: ${e.message}`);
        return;
    }

    const dictionary = { globals: {}, tables: {} };
    let funcCount = 0, fieldCount = 0, skippedCount = 0;

    for (const [snippetName, snippetData] of Object.entries(snippets)) {
        const description = snippetData.description || "";
        const firstLine = description.split('\n')[0].trim();

        // REGEX 1: METHODEN & GLOBALE FUNCTIES
        // Vangt: "[Type] Object.Functie(Params)" OF "Functie(Params)"
        const funcRegex = /^(?:([A-Za-z0-9_]+)\s+)?(?:([A-Za-z0-9_]+)\.)?([A-Za-z0-9_]+)\s*\(([^)]*)\)/;
        const funcMatch = firstLine.match(funcRegex);

        if (funcMatch) {
            const returnType = mapDataType(funcMatch[1] || "UNKNOWN");
            const callerRaw = funcMatch[2]; // Bijv 'Ord' (optioneel)
            const funcName = funcMatch[3].toUpperCase(); // Bijv 'AddRequest'
            const paramString = funcMatch[4];

            const params = parseParameters(paramString);

            // MinParams berekenen (simpel: zoek naar 'Optional' of '[' in de omschrijving)
            let minParams = params.length;
            if (paramString.includes('Optional') || paramString.includes('[')) minParams = 0;

            if (callerRaw) {
                const tableName = resolveTableName(callerRaw);
                if (!dictionary.tables[tableName]) dictionary.tables[tableName] = {};
                dictionary.tables[tableName][funcName] = { params, minParams, returns: returnType, type: "Method" };
            } else {
                dictionary.globals[funcName] = { params, minParams, returns: returnType, type: "Function" };
            }
            funcCount++;
            continue;
        }

        // REGEX 2: VELDEN / PROPERTIES
        // Vangt: "[Type] Object.Veld" (Zonder haakjes)
        const fieldRegex = /^(?:([A-Za-z0-9_]+)\s+)?([A-Za-z0-9_]+)\.([A-Za-z0-9_]+)$/;
        const fieldMatch = firstLine.match(fieldRegex);

        if (fieldMatch) {
            const returnType = mapDataType(fieldMatch[1] || "UNKNOWN");
            const tableName = resolveTableName(fieldMatch[2]);
            const fieldName = fieldMatch[3].toUpperCase();

            if (!dictionary.tables[tableName]) dictionary.tables[tableName] = {};
            dictionary.tables[tableName][fieldName] = { returns: returnType, type: "Field" };
            fieldCount++;
            continue;
        }

        // De rest (zoals Translate_UMC of WHILE_DO_DONE) overslaan
        skippedCount++;
    }

    // 🔥 HANDMATIGE STRENGE OVERRIDES (Haalt de |? weg waar '?' verboden is)
    if (dictionary.globals["ADDLOGENTRY"]) {
        dictionary.globals["ADDLOGENTRY"].params = ["STRING", "INTEGER", "STRING|?", "INTEGER|?", "LOGICAL|?", "STRING|?"];
        dictionary.globals["ADDLOGENTRY"].minParams = 6;
    }
    
    if (dictionary.tables["ORDER"] && dictionary.tables["ORDER"]["ADDREQUEST"]) {
        dictionary.tables["ORDER"]["ADDREQUEST"].params = ["STRING", "ANY", "ANY"]; // Param 1 mag GEEN '?' zijn
    }

    if (dictionary.globals["INDEX"]) {
        dictionary.globals["INDEX"].params = ["STRING", "STRING"]; // Index mag NOOIT '?' bevatten
    }

    // Map aanmaken indien nodig
    const dir = path.dirname(OUTPUT_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(dictionary, null, 2), 'utf8');

    console.log(`✅ SUCCES! glimsDictionary.json is gebouwd.`);
    console.log(`📊 Statistieken:`);
    console.log(`   - Functies toegevoegd: ${funcCount}`);
    console.log(`   - Velden toegevoegd: ${fieldCount}`);
    console.log(`   - Snippets overgeslagen: ${skippedCount}`);
}

buildDictionary();