const vscode = require('vscode');

class MisplCodeActionProvider {
    provideCodeActions(document, range, context, token) {
        const actions = [];

        // =========================================================
        // 1. CONTEXT: Selectie Acties (Wrap, Extract, Flowchart)
        // =========================================================
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

        // =========================================================
        // 2. CONTEXT: Regel-gebaseerde Acties
        // =========================================================
        const lineText = document.lineAt(range.start.line).text;
        
        if (lineText.includes(':=')) {
            const alignAction = new vscode.CodeAction('📏 Lijn alle := toewijzingen netjes uit', vscode.CodeActionKind.RefactorRewrite);
            alignAction.command = { command: 'mispl.alignAssignments', title: 'Align' };
            actions.push(alignAction);
        }

        if (/\b(YES|NO)\b/i.test(lineText) && !lineText.trim().startsWith('/*') && !lineText.trim().startsWith('//')) {
            const fixYesNo = new vscode.CodeAction("💡 Stijl-tip: Vervang YES/NO door TRUE/FALSE", vscode.CodeActionKind.RefactorRewrite);
            const edit = new vscode.WorkspaceEdit();
            const newLineText = lineText.replace(/\bYES\b/ig, 'TRUE').replace(/\bNO\b/ig, 'FALSE');
            edit.replace(document.uri, document.lineAt(range.start.line).range, newLineText);
            fixYesNo.edit = edit;
            actions.push(fixYesNo);
        }

        if (range.isEmpty && lineText.trim().length > 0 && !lineText.includes('//') && !lineText.includes('/*')) {
            const debugAction = new vscode.CodeAction('🐛 Snel-Logger (Magic Debug) invoegen', vscode.CodeActionKind.Refactor);
            debugAction.command = { command: 'mispl.magicDebug', title: 'Magic Debug' };
            actions.push(debugAction);
        }

        // =========================================================
        // 3. CONTEXT: Probleem-gebaseerde Acties (Diagnostics)
        // =========================================================
        const diagnostics = context.diagnostics;
        
        // 3.1 - Declaraties opruimen (Massale opschoonactie)
        const hasUnusedVar = diagnostics.some(d => d.message.includes('wordt niet gebruikt'));
        if (hasUnusedVar) {
            const fixAction = new vscode.CodeAction('🧹 Ruim ongebruikte declaraties automatisch op', vscode.CodeActionKind.QuickFix);
            fixAction.command = { command: 'mispl.removeUnusedVariables', title: 'Opruimen' };
            fixAction.isPreferred = true; 
            actions.push(fixAction);
        }

        // 3.2 - Dode Toewijzingen (Assignments) verwijderen
        for (const diagnostic of diagnostics) {
            if (diagnostic.message.includes("nooit meer uitgelezen")) {
                const match = diagnostic.message.match(/Waarde van '(.*?)' wordt hierna nooit meer uitgelezen/);
                if (match) {
                    const varName = match[1];
                    const action = new vscode.CodeAction(`🗑️ Verwijder overbodige toewijzing aan '${varName}'`, vscode.CodeActionKind.QuickFix);
                    action.edit = new vscode.WorkspaceEdit();

                    const fullText = document.getText();
                    const startOffset = document.offsetAt(new vscode.Position(diagnostic.range.start.line, 0));
                    const regex = new RegExp(`\\b${varName}\\b\\s*:=([\\s\\S]*?);`, 'g');
                    regex.lastIndex = startOffset;
                    const execMatch = regex.exec(fullText);

                    if (execMatch && (execMatch.index - startOffset) < 150) {
                        let matchEnd = execMatch.index + execMatch[0].length;
                        const trailing = fullText.substring(matchEnd);
                        const whitespaceMatch = trailing.match(/^[ \t]*\r?\n/);
                        if (whitespaceMatch) matchEnd += whitespaceMatch[0].length;

                        action.edit.delete(document.uri, new vscode.Range(document.positionAt(execMatch.index), document.positionAt(matchEnd)));
                        action.diagnostics = [diagnostic];
                        action.isPreferred = true;
                        actions.push(action);
                    }
                }
            }
        }

        // 3.3 - Overbodige Default Toewijzingen verwijderen
        for (const diagnostic of diagnostics) {
            if (diagnostic.message.includes("Deze eerste toewijzing is overbodig")) {
                const action = new vscode.CodeAction(`🗑️ Verwijder overbodige default toewijzing`, vscode.CodeActionKind.QuickFix);
                action.edit = new vscode.WorkspaceEdit();

                const fullText = document.getText();
                const startOffset = document.offsetAt(new vscode.Position(diagnostic.range.start.line, 0));
                const regex = /\b[a-zA-Z_][a-zA-Z0-9_]*\b\s*:=\s*(?:""|''|FALSE|NO|0|0\.0|\?)\s*;/gi;
                regex.lastIndex = startOffset;
                const execMatch = regex.exec(fullText);

                if (execMatch && (execMatch.index - startOffset) < 150) {
                    let matchEnd = execMatch.index + execMatch[0].length;
                    const trailing = fullText.substring(matchEnd);
                    const whitespaceMatch = trailing.match(/^[ \t]*\r?\n/);
                    if (whitespaceMatch) matchEnd += whitespaceMatch[0].length;

                    action.edit.delete(document.uri, new vscode.Range(document.positionAt(execMatch.index), document.positionAt(matchEnd)));
                    action.diagnostics = [diagnostic];
                    action.isPreferred = true;
                    actions.push(action);
                }
            }
        }

        // 3.4 - Lege IF-blokken verwijderen
        for (const diagnostic of diagnostics) {
            if (diagnostic.message.includes("Leeg IF blok gedetecteerd")) {
                const action = new vscode.CodeAction(`🗑️ Verwijder leeg IF-blok`, vscode.CodeActionKind.QuickFix);
                action.edit = new vscode.WorkspaceEdit();

                const fullText = document.getText();
                const startOffset = document.offsetAt(new vscode.Position(diagnostic.range.start.line, 0));
                const regex = /\bIF\b[\s\S]*?\bTHEN\b\s*(?:\/\*[\s\S]*?\*\/|\/\/.*|\s)*\bENDIF\b\s*;?/gi;
                regex.lastIndex = startOffset;
                const match = regex.exec(fullText);

                if (match && (match.index - startOffset) < 150) {
                    let matchEnd = match.index + match[0].length;
                    const trailing = fullText.substring(matchEnd);
                    const whitespaceMatch = trailing.match(/^[ \t]*\r?\n/);
                    if (whitespaceMatch) matchEnd += whitespaceMatch[0].length;

                    action.edit.delete(document.uri, new vscode.Range(document.positionAt(match.index), document.positionAt(matchEnd)));
                    action.diagnostics = [diagnostic];
                    action.isPreferred = true;
                    actions.push(action);
                }
            }
        }

        // 3.5 - Verbose Boolean (IF TRUE THEN RETURN TRUE)
        for (const diagnostic of diagnostics) {
            if (diagnostic.message.includes("veel korter schrijven als één regel:")) {
                const action = this.createBooleanFix(document, diagnostic);
                if (action) actions.push(action);
            }
        }

        // 3.6 - Optimalisatie (Alias) - Individueel
        for (const diagnostic of diagnostics) {
            if (diagnostic.message.includes("💡 Optimalisatie: Je hebt")) {
                const match = diagnostic.message.match(/Je hebt '(.*?)' al opgeslagen in klasse-variabele '(.*?)'\. Gebruik '(.*?)' om/);
                if (match) {
                    const prefix = match[1];
                    const alias = match[2];
                    const newFullText = match[3];
                    const remainder = newFullText.substring(alias.length);
                    const originalFullText = prefix + remainder; 

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

        // 3.7 - Optimalisatie (Alias) - FIX ALL
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

            const sortedOldTexts = Array.from(optChanges.keys()).sort((a, b) => b.length - a.length);
            const escapeRegExp = (string) => string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const editedRanges = []; 

            for (const oldText of sortedOldTexts) {
                const newText = optChanges.get(oldText);
                const regex = new RegExp(escapeRegExp(oldText), 'g');
                let matchRegex;
                while ((matchRegex = regex.exec(maskedText)) !== null) {
                    const startIdx = matchRegex.index;
                    const endIdx = startIdx + oldText.length;
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

        // 3.8 - Hernoem 1 variabele naar Conventie
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

        // 3.9 - Variabelen Conventie - FIX ALL
        const styleDiagnostics = allDiagnostics.filter(d => d.message.includes("Stijl-tip:") && (d.message.includes("Variabele") || d.message.includes("Parameter")));

        if (styleDiagnostics.length > 1 && diagnostics.some(d => d.message.includes("Stijl-tip:") && (d.message.includes("Variabele") || d.message.includes("Parameter")))) {
            const fixAll = new vscode.CodeAction(`🚀 Hernoem ALLE ${styleDiagnostics.length} variabelen in dit script naar de juiste conventie`, vscode.CodeActionKind.QuickFix);
            fixAll.edit = new vscode.WorkspaceEdit();
            
            const fullText = document.getText();
            const maskedText = this.getMaskedCode(fullText); 
            const changes = new Map();

            for (const d of styleDiagnostics) {
                const match = d.message.match(/(?:Variabele|Parameter) '([^']+)' .* \(bijv\. '([^']+)'/);
                if (match) changes.set(match[1], match[2]); 
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

        // 3.10 - Extract Database Veld naar Variabele
        for (const diagnostic of diagnostics) {
            const msg = diagnostic.message;
            if (msg.includes("Maak van") && msg.includes("een variabele: b.v.")) {
                try {
                    const rawExpr = msg.split("Maak van '")[1]?.split("'")[0]?.trim(); 
                    const rawVar = msg.split("b.v. ")[1]?.split(" ")[0]?.trim();

                    if (rawExpr && rawVar) {
                        const action = new vscode.CodeAction(`⚡ Extract: Maak variabele '${rawVar}'`, vscode.CodeActionKind.QuickFix);
                        action.edit = new vscode.WorkspaceEdit();
                        action.diagnostics = [diagnostic];
                        action.isPreferred = true; 

                        // 🚀 SLIMMER UITLEZEN: Ondersteunt nu ook Datum en alle GLIMS Objecten
                        let dataType = "String"; 
                        if (rawVar.startsWith("i")) dataType = "Integer";
                        else if (rawVar.startsWith("l") || rawVar.startsWith("b")) dataType = "Logical";
                        else if (rawVar.startsWith("f")) dataType = "Fractional";
                        else if (rawVar.startsWith("dt")) dataType = "DateTime";
                        else if (rawVar.startsWith("tm")) dataType = "Time";
                        else if (rawVar.startsWith("d")) dataType = "Date";
                        else if (rawVar.startsWith("obj")) dataType = "Object";
                        else if (rawVar.startsWith("ord")) dataType = "Order";
                        else if (rawVar.startsWith("rslt")) dataType = "Result";
                        else if (rawVar.startsWith("spmn")) dataType = "Specimen";
                        else if (rawVar.startsWith("crsp")) dataType = "Correspondent";
                        else if (rawVar.startsWith("prp")) dataType = "Property";

                        const text = document.getText();
                        const eol = text.includes('\r\n') ? '\r\n' : '\n';
                        const lines = text.split(eol);

                        let declLineIndex = -1;
                        const typeRegex = new RegExp(`^\\s*${dataType}\\b`, "i");
                        for (let i = 0; i < lines.length; i++) {
                            if (typeRegex.test(lines[i])) {
                                declLineIndex = i;
                                break;
                            }
                        }

                        let defaultInsertPos = 0;
                        let inComment = false;
                        for (let i = 0; i < lines.length; i++) {
                            const lineTrim = lines[i].trim();
                            if (lineTrim.startsWith("/*")) inComment = true;
                            if (lineTrim.endsWith("*/") || lineTrim.includes("*/")) { inComment = false; continue; }
                            if (!inComment && lineTrim.length > 0) {
                                if (/^(String|Integer|Logical|Fractional|Date|Time|DateTime|Object|Order|Result|Specimen|Correspondent)\b/i.test(lineTrim)) {
                                    continue;
                                }
                                defaultInsertPos = i;
                                break;
                            }
                        }

                        let insertPos = defaultInsertPos;
                        if (rawExpr.includes('.')) {
                            const baseVar = rawExpr.split('.')[0].trim();
                            const escapedBaseVar = baseVar.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
                            const assignRegex = new RegExp(`\\b${escapedBaseVar}\\s*:=`, 'i');
                            for (let i = 0; i < lines.length; i++) {
                                if (assignRegex.test(lines[i])) {
                                    insertPos = Math.max(defaultInsertPos, i + 1);
                                    break; 
                                }
                            }
                        }

                        const escapedExpr = rawExpr.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
                        const searchRegex = new RegExp(escapedExpr, 'gi');
                        for (let i = 0; i < lines.length; i++) {
                            lines[i] = lines[i].replace(searchRegex, rawVar);
                        }

                        if (declLineIndex !== -1) {
                            const semiColonIndex = lines[declLineIndex].lastIndexOf(';');
                            if (semiColonIndex !== -1) {
                                lines[declLineIndex] = lines[declLineIndex].substring(0, semiColonIndex) + `,${rawVar};` + lines[declLineIndex].substring(semiColonIndex + 1);
                            } else {
                                lines[declLineIndex] += `,${rawVar};`;
                            }
                        }

                        if (declLineIndex !== -1) {
                            lines.splice(insertPos, 0, `${rawVar} := ${rawExpr};`);
                        } else {
                            lines.splice(insertPos, 0, `${rawVar} := ${rawExpr};`);
                            lines.splice(defaultInsertPos, 0, `${dataType} ${rawVar};`);
                        }

                        const finalOutput = lines.join(eol);
                        const fullRange = new vscode.Range(document.positionAt(0), document.positionAt(text.length));
                        action.edit.replace(document.uri, fullRange, finalOutput);
                        actions.push(action);
                    }
                } catch (err) {
                    console.error("Fout in Extract Variabele CodeAction: ", err);
                }
            }
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