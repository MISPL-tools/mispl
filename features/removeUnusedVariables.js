// ./features/removeUnusedVariables.js
const { parseMISPL, analyze } = require("../analyzeMISPL"); 
const { t } = require("../i18n"); 

function removeUnusedVariablesText(text) {
    if (!text) return "";

    const parseResult = parseMISPL(text);
    const analysisResult = analyze(parseResult, text);
    const errors = analysisResult.errors || analysisResult; 

    const unusedVars = new Set();
    
    // 🌍 TAALONAFHANKELIJK ZOEKEN: Robuuste check op begin én eind van de zin
    const unusedTemplate = t('WARN_VAR_DECLARED_NOT_USED', '@@@');
    const unusedParts = unusedTemplate.split('@@@');
    const unusedPrefix = unusedParts[0];
    const unusedSuffix = unusedParts.length > 1 ? unusedParts[1] : '';

    for (const err of errors) {
        if (err && err.message && 
            err.message.includes(unusedPrefix) && 
            (unusedSuffix === '' || err.message.includes(unusedSuffix))) {
            
            const match = err.message.match(/'([^']+)'/);
            if (match) {
                unusedVars.add(match[1]); // Sla op in een efficiënte Set
            }
        }
    }

    if (unusedVars.size === 0) {
        return text;
    }

    // ============================================================================
    // 🚀 DEFINITIEVE FIX: Lijn-voor-lijn verwerking met Depth-Aware Comment Check
    // ============================================================================
    
    const lines = text.split(/\r?\n/);
    let inBlockComment = false;
    let inDeclarationZone = true; // We mogen declaraties aanpassen totdat we uitvoerende code zien
    
    for (let i = 0; i < lines.length; i++) {
        let line = lines[i];
        let originalLine = line;

        // 1. Houd Block Comments Bij (/* ... */)
        if (!inBlockComment && line.includes('/*')) {
            // Begint er een commentaarblok?
            const commentStart = line.indexOf('/*');
            const commentEnd = line.indexOf('*/', commentStart + 2);
            
            if (commentEnd === -1) {
                inBlockComment = true; // Gaat door op volgende regel
                continue; // Skip the rest of this line
            }
            // Als het opent én sluit op dezelfde regel, doen we even alsof het niet bestaat
            line = line.substring(0, commentStart) + line.substring(commentEnd + 2);
        } else if (inBlockComment) {
            if (line.includes('*/')) {
                inBlockComment = false;
                line = line.substring(line.indexOf('*/') + 2); // Pak alles ná de sluiter
            } else {
                continue; // Skip volledige commentaar-regel
            }
        }

        // Als we hier zijn, kijken we naar actieve, niet-commentaar code
        const trimmedLine = line.trim();
        if (trimmedLine.length === 0) continue;

        // Zodra we een toewijzing (:=) of instructie zien, stopt de declaratie-zone
        if (/:=|\b(IF|WHILE|REPEAT|RETURN)\b/i.test(trimmedLine)) {
            inDeclarationZone = false;
            break; // Geen declaraties meer te vinden, stop de loop voor snelheid
        }

        // Zitten we in de declaratie-zone én begint de regel met een data-type?
        if (inDeclarationZone && /^\b(?:String|Integer|Logical|Fractional|Date|Time|DateTime|Mnemonic|Object|Result|Order|Specimen|Person|Correspondent|Action|ResultStatus)\b/i.test(trimmedLine)) {
            
            let modifiedLine = originalLine;

            for (let uv of unusedVars) {
                // Veilig de variabele verwijderen. We accepteren spaties en komma's
                const varRegex = new RegExp(`\\b${uv}\\b\\s*,?\\s*`, 'g');
                modifiedLine = modifiedLine.replace(varRegex, '');
            }

            // Repareer eventueel achtergebleven komma-rommel
            modifiedLine = modifiedLine.replace(/,\s*,/g, ',');         // Dubbele komma's: ,, -> ,
            modifiedLine = modifiedLine.replace(/,\s*;/g, ';');         // Komma direct voor puntkomma: ,; -> ;
            
            // Verwijder zwevende komma direct na het datatype (b.v. "String ,")
            modifiedLine = modifiedLine.replace(/(\b[a-zA-Z_]\w*\s+),\s*/, '$1'); 

            // Als er niets meer over is behalve het datatype en een puntkomma, wis de hele regel
            if (/^[a-zA-Z_]\w*\s*;$/.test(modifiedLine.trim())) {
                modifiedLine = "";
            }

            // Sla de gewijzigde regel op, en verwijder de regel volledig als hij nu leeg is (terwijl hij dat eerst niet was)
            if (modifiedLine.trim() === "" && originalLine.trim() !== "") {
                lines[i] = null; 
            } else {
                lines[i] = modifiedLine;
            }
        }
    }

    // Voeg alles weer samen, sla de `null` regels over
    return lines.filter(l => l !== null).join('\n');
}

module.exports = removeUnusedVariablesText;