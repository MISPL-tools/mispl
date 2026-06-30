const vscode = require('vscode');

class MisplCodeActionProvider {
    provideCodeActions(document, range, context, token) {
        const actions = [];

        // 1. CONTEXT: Heeft de gebruiker een stuk tekst geselecteerd?
        if (!range.isEmpty) {
            const wrapAction = new vscode.CodeAction('💡 Inpakken in IF / WHILE blok', vscode.CodeActionKind.Refactor);
            wrapAction.command = { command: 'mispl.wrapInBlock', title: 'Wrap' };
            actions.push(wrapAction);

            const extractAction = new vscode.CodeAction('✂️ Extract to Variable (Maak nieuwe variabele)', vscode.CodeActionKind.RefactorExtract);
            extractAction.command = { command: 'mispl.extractVariable', title: 'Extract' };
            actions.push(extractAction);

            const flowAction = new vscode.CodeAction('📊 Teken Flowchart van deze selectie', vscode.CodeActionKind.Empty);
            flowAction.command = { command: 'mispl.showSelectedFlowchart', title: 'Flowchart' };
            actions.push(flowAction);
        }

        // 2. CONTEXT: Staat de cursor ergens op een regel met een toewijzing (:=) ?
        const lineText = document.lineAt(range.start.line).text;
        if (lineText.includes(':=')) {
            const alignAction = new vscode.CodeAction('📏 Lijn alle := toewijzingen netjes uit', vscode.CodeActionKind.RefactorRewrite);
            alignAction.command = { command: 'mispl.alignAssignments', title: 'Align' };
            actions.push(alignAction);
        }

        // YES/NO vervangen door TRUE/FALSE
        if (/\b(YES|NO)\b/i.test(lineText) && !lineText.trim().startsWith('/*') && !lineText.trim().startsWith('//')) {
            const fixYesNo = new vscode.CodeAction("💡 Stijl-tip: Vervang YES/NO door TRUE/FALSE", vscode.CodeActionKind.RefactorRewrite);
            const edit = new vscode.WorkspaceEdit();
            const newLineText = lineText.replace(/\bYES\b/ig, 'TRUE').replace(/\bNO\b/ig, 'FALSE');
            edit.replace(document.uri, document.lineAt(range.start.line).range, newLineText);
            fixYesNo.edit = edit;
            actions.push(fixYesNo);
        }

        const diagnostics = context.diagnostics;
        
        // Ongebruikte variabelen opruimen
        const hasUnusedVar = diagnostics.some(d => 
            d.message.includes('wordt niet gebruikt') || 
            d.message.includes('nooit meer uitgelezen')
        );
        
        if (hasUnusedVar) {
            const fixAction = new vscode.CodeAction('🧹 Ruim ongebruikte variabelen automatisch op', vscode.CodeActionKind.QuickFix);
            fixAction.command = { command: 'mispl.removeUnusedVariables', title: 'Opruimen' };
            fixAction.isPreferred = true; 
            actions.push(fixAction);
        }

        // Verbose Boolean Quick Fix
        for (const diagnostic of diagnostics) {
            if (diagnostic.message.includes("veel korter schrijven als één regel:")) {
                const action = this.createBooleanFix(document, diagnostic);
                if (action) actions.push(action);
            }
        }

        // Snel-Logger (Magic Debug)
        if (range.isEmpty && lineText.trim().length > 0 && !lineText.includes('//') && !lineText.includes('/*')) {
            const debugAction = new vscode.CodeAction('🐛 Snel-Logger (Magic Debug) invoegen', vscode.CodeActionKind.Refactor);
            debugAction.command = { command: 'mispl.magicDebug', title: 'Magic Debug' };
            actions.push(debugAction);
        }

        // =========================================================
        // --- NIEUW 3: Optimalisatie (Alias) - Individueel ---
        // =========================================================
        for (const diagnostic of diagnostics) {
            if (diagnostic.message.includes("💡 Optimalisatie: Je hebt")) {
                const match = diagnostic.message.match(/Je hebt '(.*?)' al opgeslagen in klasse-variabele '(.*?)'\. Gebruik '(.*?)' om/);
                if (match) {
                    const prefix = match[1];
                    const alias = match[2];
                    const newFullText = match[3];
                    const remainder = newFullText.substring(alias.length);
                    const originalFullText = prefix + remainder; // Reconstructie van de exacte foute code

                    const action = new vscode.CodeAction(`✨ Vervang door: '${newFullText}'`, vscode.CodeActionKind.QuickFix);
                    action.edit = new vscode.WorkspaceEdit();
                    const line = document.lineAt(diagnostic.range.start.line);
                    const maskedLine = this.getMaskedCode(line.text);
                    const idx = maskedLine.indexOf(originalFullText);
                    
                    if (idx !== -1) {
                        const replaceRange = new vscode.Range(line.lineNumber, idx, line.lineNumber, idx + originalFullText.length);
                        action.edit.replace(document.uri, replaceRange, newFullText);
                        action.diagnostics = [diagnostic];
                        action.isPreferred = true; 
                        actions.push(action);
                    }
                }
            }
        }

        // =========================================================
        // --- NIEUW 4: Optimalisatie (Alias) - FIX ALL 🚀 ---
        // =========================================================
        const allDiagnostics = vscode.languages.getDiagnostics(document.uri);
        const optDiagnostics = allDiagnostics.filter(d => d.message.includes("💡 Optimalisatie: Je hebt"));

        if (optDiagnostics.length > 1 && diagnostics.some(d => d.message.includes("💡 Optimalisatie: Je hebt"))) {
            const fixAllOpt = new vscode.CodeAction(`🚀 Pas ALLE ${optDiagnostics.length} optimalisaties (Aliassen) toe in dit script`, vscode.CodeActionKind.QuickFix);
            fixAllOpt.edit = new vscode.WorkspaceEdit();
            
            const fullText = document.getText();
            const maskedText = this.getMaskedCode(fullText);
            const optChanges = new Map(); 

            for (const d of optDiagnostics) {
                const match = d.message.match(/Je hebt '(.*?)' al opgeslagen in klasse-variabele '(.*?)'\. Gebruik '(.*?)' om/);
                if (match) {
                    const prefix = match[1];
                    const alias = match[2];
                    const newFullText = match[3];
                    const remainder = newFullText.substring(alias.length);
                    const originalFullText = prefix + remainder;
                    optChanges.set(originalFullText, newFullText);
                }
            }

            // Sorteer op lengte (langste eerst) om overlap-fouten te voorkomen
            const sortedOldTexts = Array.from(optChanges.keys()).sort((a, b) => b.length - a.length);
            const escapeRegExp = (string) => string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const editedRanges = []; // Houdt bij waar we al bewerkt hebben

            for (const oldText of sortedOldTexts) {
                const newText = optChanges.get(oldText);
                const regex = new RegExp(escapeRegExp(oldText), 'g');
                let matchRegex;
                while ((matchRegex = regex.exec(maskedText)) !== null) {
                    const startIdx = matchRegex.index;
                    const endIdx = startIdx + oldText.length;
                    
                    // Check of we deze regio niet al hebben overschreven (overlap-beveiliging)
                    const hasOverlap = editedRanges.some(r => (startIdx >= r.start && startIdx < r.end) || (endIdx > r.start && endIdx <= r.end));
                    
                    if (!hasOverlap) {
                        const startPos = document.positionAt(startIdx);
                        const endPos = document.positionAt(endIdx);
                        fixAllOpt.edit.replace(document.uri, new vscode.Range(startPos, endPos), newText);
                        editedRanges.push({start: startIdx, end: endIdx});
                    }
                }
            }

            fixAllOpt.diagnostics = optDiagnostics;
            actions.push(fixAllOpt);
        }

        // =========================================================
        // --- NIEUW 5: Hernoem 1 variabele naar Conventie ---
        // =========================================================
        for (const diagnostic of diagnostics) {
            if (diagnostic.message.includes("Stijl-tip:") && (diagnostic.message.includes("Variabele") || diagnostic.message.includes("Parameter"))) {
                const match = diagnostic.message.match(/(?:Variabele|Parameter) '([^']+)' .* \(bijv\. '([^']+)'/);
                if (match) {
                    const oldName = match[1];
                    const newName = match[2];

                    const fixOne = new vscode.CodeAction(`✨ Hernoem '${oldName}' overal naar '${newName}'`, vscode.CodeActionKind.QuickFix);
                    fixOne.edit = new vscode.WorkspaceEdit();
                    
                    const fullText = document.getText();
                    const maskedText = this.getMaskedCode(fullText); 
                    
                    const regex = new RegExp(`(?<!\\.\\s*)\\b${oldName}\\b`, 'gi');
                    let matchRegex;
                    while ((matchRegex = regex.exec(maskedText)) !== null) {
                        const startPos = document.positionAt(matchRegex.index);
                        const endPos = document.positionAt(matchRegex.index + matchRegex[0].length);
                        fixOne.edit.replace(document.uri, new vscode.Range(startPos, endPos), newName);
                    }
                    
                    fixOne.diagnostics = [diagnostic];
                    fixOne.isPreferred = true;
                    actions.push(fixOne);
                }
            }
        }

        // =========================================================
        // --- NIEUW 6: Variabelen Conventie - FIX ALL 🚀 ---
        // =========================================================
        const styleDiagnostics = allDiagnostics.filter(d => d.message.includes("Stijl-tip:") && (d.message.includes("Variabele") || d.message.includes("Parameter")));

        if (styleDiagnostics.length > 1 && diagnostics.some(d => d.message.includes("Stijl-tip:") && (d.message.includes("Variabele") || d.message.includes("Parameter")))) {
            
            const fixAll = new vscode.CodeAction(`🚀 Hernoem ALLE ${styleDiagnostics.length} variabelen in dit script naar de juiste conventie`, vscode.CodeActionKind.QuickFix);
            fixAll.edit = new vscode.WorkspaceEdit();
            
            const fullText = document.getText();
            const maskedText = this.getMaskedCode(fullText); 
            const changes = new Map();

            for (const d of styleDiagnostics) {
                const match = d.message.match(/(?:Variabele|Parameter) '([^']+)' .* \(bijv\. '([^']+)'/);
                if (match) {
                    changes.set(match[1], match[2]); 
                }
            }

            const editedRanges = [];

            changes.forEach((newName, oldName) => {
                const regex = new RegExp(`(?<!\\.\\s*)\\b${oldName}\\b`, 'gi');
                let matchRegex;
                while ((matchRegex = regex.exec(maskedText)) !== null) {
                    const startIdx = matchRegex.index;
                    const endIdx = startIdx + matchRegex[0].length;
                    
                    const hasOverlap = editedRanges.some(r => (startIdx >= r.start && startIdx < r.end) || (endIdx > r.start && endIdx <= r.end));

                    if (!hasOverlap) {
                        const startPos = document.positionAt(startIdx);
                        const endPos = document.positionAt(endIdx);
                        fixAll.edit.replace(document.uri, new vscode.Range(startPos, endPos), newName);
                        editedRanges.push({start: startIdx, end: endIdx});
                    }
                }
            });

            fixAll.diagnostics = styleDiagnostics;
            actions.push(fixAll);
        }

        return actions;
    }

    // --- DE MASKER HELPER FUNCTIE ---
    getMaskedCode(text) {
        let masked = "";
        let inString = false;
        let stringChar = '';
        let inLineComment = false;
        let inBlockComment = false;
        let blockDepth = 0;

        for (let i = 0; i < text.length; i++) {
            const c = text[i];
            const next = text[i + 1] || '';

            if (inLineComment) {
                if (c === '\n' || c === '\r') {
                    inLineComment = false;
                    masked += c; 
                } else {
                    masked += ' ';
                }
            } else if (inBlockComment) {
                if (c === '/' && next === '*') {
                    blockDepth++;
                    masked += '  ';
                    i++;
                } else if (c === '*' && next === '/') {
                    blockDepth--;
                    if (blockDepth === 0) inBlockComment = false;
                    masked += '  ';
                    i++;
                } else if (c === '\n' || c === '\r') {
                    masked += c;
                } else {
                    masked += ' ';
                }
            } else if (inString) {
                if (c === stringChar) {
                    if (next === stringChar) {
                        masked += '  ';
                        i++;
                    } else {
                        inString = false;
                        masked += ' '; 
                    }
                } else if (c === '\n' || c === '\r') {
                    masked += c; 
                } else {
                    masked += ' ';
                }
            } else {
                if (c === '/' && next === '/') {
                    inLineComment = true;
                    masked += '  ';
                    i++;
                } else if (c === '/' && next === '*') {
                    inBlockComment = true;
                    blockDepth = 1;
                    masked += '  ';
                    i++;
                } else if (c === '"' || c === "'") {
                    inString = true;
                    stringChar = c;
                    masked += ' '; 
                } else {
                    masked += c;
                }
            }
        }
        return masked;
    }

    createBooleanFix(document, diagnostic) {
        const fix = new vscode.CodeAction("💡 Vereenvoudig IF-statement naar één regel", vscode.CodeActionKind.QuickFix);
        fix.diagnostics = [diagnostic];
        fix.isPreferred = true; 

        const match = diagnostic.message.match(/één regel:\s*(.*)$/);
        if (!match) return null;
        const newCode = match[1].trim();

        let startLine = diagnostic.range.start.line;
        let endLine = startLine;
        let depth = 0;

        for (let i = startLine; i < document.lineCount; i++) {
            const lineText = document.lineAt(i).text.toUpperCase();
            if (/\bIF\b/.test(lineText) && /\bTHEN\b/.test(lineText)) depth++;
            if (/\bENDIF\b/.test(lineText)) {
                depth--;
                if (depth === 0) {
                    endLine = i;
                    break;
                }
            }
        }

        const rangeToReplace = new vscode.Range(startLine, 0, endLine, document.lineAt(endLine).text.length);
        const indent = document.lineAt(startLine).text.match(/^\s*/)[0]; 
        
        const edit = new vscode.WorkspaceEdit();
        edit.replace(document.uri, rangeToReplace, indent + newCode);
        
        fix.edit = edit;
        return fix;
    }
}

function registerCodeActions(context) {
    context.subscriptions.push(
        vscode.languages.registerCodeActionsProvider('mispl', new MisplCodeActionProvider(), {
            providedCodeActionKinds: [
                vscode.CodeActionKind.Refactor,
                vscode.CodeActionKind.QuickFix,
                vscode.CodeActionKind.Empty,
                vscode.CodeActionKind.RefactorRewrite,
                vscode.CodeActionKind.RefactorExtract
            ]
        })
    );
}

module.exports = registerCodeActions;