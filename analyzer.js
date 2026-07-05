// analyzer.js
const { analyze: analyzeMISPL } = require("./analyzeMISPL");
const { t } = require("./i18n"); // 🌍 Importeer de i18n module

function analyze(astOrResult, rawCode) {
    let result;
    try {
        if (typeof analyzeMISPL !== 'function') {
            throw new Error(t('ERR_ANALYZER_NOT_FOUND'));
        }
        result = analyzeMISPL(astOrResult, rawCode);
    } catch (err) {
        return [{
            line: 0,
            message: t('ERR_ANALYZER_UNEXPECTED', err?.message || String(err)),
            severity: 8 
        }];
    }

    if (!result || typeof result !== "object") return [];
    if (Array.isArray(result)) return result;
    return Array.isArray(result.errors) ? result.errors : [];
}

module.exports = { analyze };