const vscode = require('vscode');
const fs = require('fs');
const path = require('path');
const { parseMISPL } = require('../analyzeMISPL');

let glimsDict = { globals: {}, tables: {} };

try {
    const dictPath = path.join(__dirname, 'glimsDictionary.json');
    if (fs.existsSync(dictPath)) {
        const rawData = fs.readFileSync(dictPath, "utf8");
        const cleanData = rawData.replace(/^\uFEFF/, ''); 
        glimsDict = JSON.parse(cleanData);
    } else {
        console.warn("HoverProvider: glimsDictionary.json niet gevonden.");
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
        // Laat de parser razendsnel de gedeclareerde variabelen uit dit script halen
        const sourceCode = document.getText();
        const parseResult = parseMISPL(sourceCode);
        
        if (parseResult && parseResult.variables) {
            const varType = parseResult.variables.get(word.toLowerCase());
            if (varType) {
                // Return een chique popup voor de lokale variabele
                const md = new vscode.MarkdownString();
                md.appendCodeblock(`(local variable) ${varType} ${word}`, 'mispl');
                md.appendMarkdown(`\nGedeclareerde **${varType}** variabele in dit script.`);
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
                    md.appendMarkdown(`\n\n---\n*Standaard GLIMS functie.*`);
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