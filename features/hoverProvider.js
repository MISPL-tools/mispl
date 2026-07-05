const vscode = require('vscode');
const fs = require('fs');
const path = require('path');
const { parseMISPL, analyze } = require('../analyzeMISPL');
const { t } = require('../i18n'); 

let glimsDict = { globals: {}, tables: {} };

try {
    const dictPath = path.join(__dirname, 'glimsDictionary.json');
    if (fs.existsSync(dictPath)) {
        const rawData = fs.readFileSync(dictPath, "utf8");
        const cleanData = rawData.replace(/^\uFEFF/, ''); 
        glimsDict = JSON.parse(cleanData);
    } else {
        console.warn(t('WARN_DICT_NOT_FOUND'));
    }
} catch (err) {
    console.error("HoverProvider Error loading glimsDictionary.json:", err);
}

class MisplHoverProvider {
    provideHover(document, position, token) {
        const wordRange = document.getWordRangeAtPosition(position);
        if (!wordRange) return null;
        
        const word = document.getText(wordRange);
        const lineText = document.lineAt(position.line).text;
        
        // --- 1. LOCAL VARIABLE HOVER ---
        const sourceCode = document.getText();
        
        const parseResult = parseMISPL(sourceCode);
        const analysisResult = analyze(parseResult, sourceCode); 
        
        if (analysisResult && analysisResult.variables) {
            const lowerWord = word.toLowerCase();
            const varType = analysisResult.variables.get(lowerWord);
            
            const assignedData = analysisResult.assignedVars ? analysisResult.assignedVars.get(lowerWord) : null;

            if (varType || assignedData) {
                const md = new vscode.MarkdownString();
                const displayType = varType ? varType : "UNKNOWN";
                
                md.appendCodeblock(`(local variable) ${displayType} ${word}`, 'mispl');
                md.appendMarkdown(t('HOVER_LOCAL_VAR_DECL', displayType));

                if (assignedData && assignedData.history && assignedData.history.length > 0) {
                    const totalCount = assignedData.history.length;
                    md.appendMarkdown(t('HOVER_ASSIGN_COUNT', totalCount));

                    const currentLine = position.line;
                    
                    // 🚀 DE FIX: We kijken nu strikt naar toewijzingen VÓÓR deze regel
                    const pastAssignments = assignedData.history.filter(h => h.line < currentLine);
                    const sameLineAssignments = assignedData.history.filter(h => h.line === currentLine);

                    if (pastAssignments.length > 0) {
                        // Er is een historie vóór deze regel!
                        const last = pastAssignments[pastAssignments.length - 1];
                        md.appendMarkdown(t('HOVER_LAST_VAL', last.line + 1));
                        
                        const valToShow = last.value !== undefined && last.value !== null ? String(last.value) : "???";
                        md.appendCodeblock(valToShow, "mispl");
                    } else if (sameLineAssignments.length > 0) {
                        // Er is geen historie vóór deze regel, maar wel óp deze regel.
                        md.appendMarkdown(t('HOVER_VAL_FIRST_TIME'));
                    } else {
                        // Er is geen historie vóór, en niet op deze regel. Waarde komt pas later.
                        md.appendMarkdown(t('HOVER_VAL_LATER', currentLine + 1));
                    }
                }

                return new vscode.Hover(md, wordRange);
            }
        }

        // --- 2. GLOBAL FUNCTION HOVER ---
        const isFunctionCall = new RegExp(`\\b${word}\\s*\\(`, 'i').test(lineText);
        if (isFunctionCall) {
            const globalDef = this.findGlobalFunction(word);
            if (globalDef) {
                const md = new vscode.MarkdownString();
                const params = globalDef.params ? globalDef.params.join(", ") : "";
                const returns = globalDef.returns || "UNKNOWN";
                
                md.appendCodeblock(`(global) ${returns} ${word}(${params})`, 'mispl');
                
                if (globalDef.description) {
                    md.appendMarkdown(`\n\n---\n${globalDef.description}`);
                } else {
                    md.appendMarkdown(t('HOVER_STD_FUNC'));
                }
                
                return new vscode.Hover(md, wordRange);
            }
        }

        // --- 3. PROPERTY / METHOD HOVER ---
        const propMatch = lineText.substring(0, wordRange.end.character).match(new RegExp(`\\.(${word})$`, 'i'));
        if (propMatch) {
            const tableMatch = this.guessTableContext(lineText, wordRange.start.character);
            
            if (tableMatch) {
                const def = this.findTableProperty(tableMatch, word);
                if (def) {
                    const md = new vscode.MarkdownString();
                    
                    if (def.type === "Method") {
                        const params = def.params ? def.params.join(", ") : "";
                        const returns = def.returns || "UNKNOWN";
                        md.appendCodeblock(`(method) ${tableMatch}.${word}(${params}) : ${returns}`, 'mispl');
                    } else {
                        const returns = def.returns || "UNKNOWN";
                        md.appendCodeblock(`(property) ${tableMatch}.${word} : ${returns}`, 'mispl');
                    }

                    if (def.description) {
                        md.appendMarkdown(`\n\n---\n${def.description}`);
                    }
                    return new vscode.Hover(md, wordRange);
                }
            }
        }

        return null;
    }

    findGlobalFunction(name) {
        const upperName = name.toUpperCase();
        for (const [key, def] of Object.entries(glimsDict.globals || {})) {
            if (key.toUpperCase() === upperName) return def;
        }
        return null;
    }

    findTableProperty(tableName, propName) {
        const upperTable = tableName.toUpperCase();
        const upperProp = propName.toUpperCase();
        
        const table = glimsDict.tables[upperTable];
        if (!table) return null;

        for (const [key, def] of Object.entries(table)) {
            if (key.toUpperCase() === upperProp) return def;
        }
        return null;
    }

    guessTableContext(lineText, wordStartIndex) {
        const beforeWord = lineText.substring(0, wordStartIndex).trim();
        
        const classMatch = beforeWord.match(/\b([a-zA-Z_][a-zA-Z0-9_]*)\.$/);
        if (classMatch) {
            const possibleAlias = classMatch[1].toUpperCase();
            if (possibleAlias === "ORDR" || possibleAlias === "ORD") return "ORDER";
            if (possibleAlias === "RSLT") return "RESULT";
            if (possibleAlias === "OBJ") return "OBJECT";
            if (possibleAlias === "SPMN") return "SPECIMEN";
            if (possibleAlias === "CRSP") return "CORRESPONDENT";
            if (possibleAlias === "PRSN") return "PERSON";
            return possibleAlias;
        }

        if (beforeWord.endsWith(".")) {
            return "UNKNOWN_TABLE";
        }

        return null;
    }
}

function registerHoverProvider(context) {
    context.subscriptions.push(
        vscode.languages.registerHoverProvider('mispl', new MisplHoverProvider())
    );
}

module.exports = registerHoverProvider;