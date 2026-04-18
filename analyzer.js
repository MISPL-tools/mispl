// analyzer.js
const { analyze: analyzeMISPL } = require("./analyzeMISPL");

function analyze(astOrResult, rawCode) {
    let result;
    try {
        if (typeof analyzeMISPL !== 'function') {
            throw new Error("De functie 'analyze' kon niet worden gevonden in analyzeMISPL.js.");
        }
        result = analyzeMISPL(astOrResult, rawCode);
    } catch (err) {
        return [{
            line: 0,
            message: "Onverwachte fout in statische analyse: " + (err?.message || String(err)),
            severity: 8 
        }];
    }

    if (!result || typeof result !== "object") return [];
    if (Array.isArray(result)) return result;
    return Array.isArray(result.errors) ? result.errors : [];
}

module.exports = { analyze };