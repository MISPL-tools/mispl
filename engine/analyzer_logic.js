// engine/analyzer_logic.js
const path = require("path");
const { NodeTypes } = require(path.join(__dirname, "..", "ast.js"));

const AnalysisContext = require("./context");
const Validators = require("./validators");
const { TypeChecker } = require("./typeChecker");

function analyze(astOrResult, rawText = "") {
    const errors = [];
    let ast = astOrResult && typeof astOrResult === "object" ? (astOrResult.ast || astOrResult) : null;
    
    if (astOrResult && Array.isArray(astOrResult.errors)) {
        astOrResult.errors.forEach(e => errors.push({ line: e.line || 0, message: String(e.message || e), severity: e.severity || 8 }));
    }

    const context = new AnalysisContext(errors);
    
    const safeText = typeof rawText === "string" ? rawText : "";
    
    // Stijl-tip voor commentaarblok bovenaan
    if (safeText.trim() !== "" && !safeText.includes("/*")) {
        context.addInfo(0, `💡 Stijl-tip: Een MISPL hoort te beginnen met een /* commentaarblok */.`);
    }

    try {
        if (ast && ast.type === NodeTypes.Program && Array.isArray(ast.body)) {
            // 1. Loop door alle acties en check scopes/types
            ast.body.forEach(node => { 
                Validators.analyzeScope(node, context); 
                Validators.analyzeStructure(node, context); 
            });
            
            // 2. Logica analyse (Oneindige loops & nutteloze IFs)
            Validators.analyzeLoops(ast.body, context);
            Validators.analyzeIfStatements(ast.body, context);

            // 3. Controleer op ongebruikte en niet-gedeclareerde variabelen
            context.usedVars.forEach((info, key) => {
                if (!context.declaredVars.has(key)) {
                    context.addError(info.lines[0] || 0, `❌ FOUT: Variabele '${info.originalName}' gebruikt maar niet gedeclareerd.`);
                }
            });

            context.declaredVars.forEach((info, key) => {
                if (!context.usedVars.has(key)) {
                    context.addWarning(info.line, `Variabele '${info.originalName}' wordt nooit gebruikt.`);
                }
            });

            context.assignedVars.forEach((info, key) => {
                if (!context.readVars.has(key)) {
                    info.lines.forEach(lineNo => context.addWarning(lineNo, `⚠️ WAARSCHUWING: Waarde van '${info.originalName}' wordt hierna nooit meer uitgelezen (Mogelijke dode code of overbodige query).`));
                }
            });
        }
    } catch (err) {
        context.addError(0, `🚨 Linter Fout: ${err.message}`);
    }

    return {
        errors: context.errors,
        variables: astOrResult.variables || new Map()
    };
}

module.exports = { analyze };