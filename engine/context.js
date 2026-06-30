class AnalysisContext {
    constructor(errors = []) {
        this.errors = errors;
        this.declaredVars = new Map();
        this.usedVars = new Map();
        this.tableRefs = new Map();
        this.aliases = new Map();
        this.assignedVars = new Map();
        this.readVars = new Set();
        this.uninitializedWarned = new Set(); 
        this.addRequestCount = 0; 
    }

    addError(line, message) { this.errors.push({ line, message, severity: 8 }); }
    addWarning(line, message) { this.errors.push({ line, message, severity: 4 }); }
    addInfo(line, message) { this.errors.push({ line, message, severity: 2 }); }

    registerDeclaration(name, line, dataType = "UNKNOWN") {
        const key = String(name).toLowerCase();
        if (!this.declaredVars.has(key)) {
            this.declaredVars.set(key, { line, originalName: name, dataType: dataType });
        }
    }

    registerRead(name, line) {
        if (!name) return;
        this.readVars.add(String(name).toLowerCase());
        this.registerUsage(name, line);
    }

    registerWrite(name, line) {
        if (!name) return;
        const key = String(name).toLowerCase();
        for (const [cachedExpression, cachedVarName] of this.aliases.entries()) {
            if (new RegExp(`\\b${key}\\b`).test(cachedExpression)) this.aliases.delete(cachedExpression);
        }
        const info = this.assignedVars.get(key) || { lines: [], originalName: name };
        info.lines.push(line);
        this.assignedVars.set(key, info);
        this.registerUsage(name, line);
    }

    registerUsage(name, line) {
        if (!name) return;
        const key = String(name).toLowerCase();
        const info = this.usedVars.get(key) || { lines: [], originalName: name };
        info.lines.push(line);
        this.usedVars.set(key, info);
    }

    registerTableRef(lookupKey, originalName, line) {
        const info = this.tableRefs.get(lookupKey) || { count: 0, lines: [], originalName: originalName };
        info.count++;
        info.lines.push(line);
        this.tableRefs.set(lookupKey, info);
    }

    registerAssignment(varName, valueExpr) {
        // De isPureReference check wordt in typeChecker gedaan, we hoeven hier alleen de referentie op te slaan
        // als die wordt doorgegeven vanuit validators.
        if (valueExpr && typeof valueExpr === 'string' && valueExpr.includes('.')) {
             const clean = String(valueExpr).trim().replace(/\s+/g, "").toLowerCase();
             this.aliases.set(clean, varName);
        }
    }
}

module.exports = AnalysisContext;