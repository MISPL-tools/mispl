const vscode = require('vscode');

class MisplCodeActionProvider {
    provideCodeActions(document, range, context, token) {
        const actions = [];

        // 1. CONTEXT: Heeft de gebruiker een stuk tekst geselecteerd?
        if (!range.isEmpty) {
            // Suggereer: Inpakken
            const wrapAction = new vscode.CodeAction('💡 Inpakken in IF / WHILE blok', vscode.CodeActionKind.Refactor);
            wrapAction.command = { command: 'mispl.wrapInBlock', title: 'Wrap' };
            actions.push(wrapAction);

            // Suggereer: Extract Variable
            const extractAction = new vscode.CodeAction('✂️ Extract to Variable (Maak nieuwe variabele)', vscode.CodeActionKind.RefactorExtract);
            extractAction.command = { command: 'mispl.extractVariable', title: 'Extract' };
            actions.push(extractAction);

            // Suggereer: Flowchart
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

        // --- NIEUW 1: YES/NO vervangen door TRUE/FALSE ---
        // We sluiten commentaarregels uit zodat hij niet per ongeluk in je tekst gaat wroeten
        if (/\b(YES|NO)\b/i.test(lineText) && !lineText.trim().startsWith('/*') && !lineText.trim().startsWith('//')) {
            const fixYesNo = new vscode.CodeAction("💡 Stijl-tip: Vervang YES/NO door TRUE/FALSE", vscode.CodeActionKind.RefactorRewrite);
            const edit = new vscode.WorkspaceEdit();
            
            // Vervang case-insensitive alle YES en NO woorden
            const newLineText = lineText.replace(/\bYES\b/ig, 'TRUE').replace(/\bNO\b/ig, 'FALSE');
            
            edit.replace(document.uri, document.lineAt(range.start.line).range, newLineText);
            fixYesNo.edit = edit;
            actions.push(fixYesNo);
        }

        // 3. CONTEXT: Is er een waarschuwing of fout op deze regel? (Quick Fixes)
        const diagnostics = context.diagnostics;
        
        // Check of de analyzer klaagt over ongebruikte/dode variabelen
        const hasUnusedVar = diagnostics.some(d => 
            d.message.includes('wordt niet gebruikt') || 
            d.message.includes('nooit meer uitgelezen')
        );
        
        if (hasUnusedVar) {
            const fixAction = new vscode.CodeAction('🧹 Ruim ongebruikte variabelen automatisch op', vscode.CodeActionKind.QuickFix);
            fixAction.command = { command: 'mispl.removeUnusedVariables', title: 'Opruimen' };
            fixAction.isPreferred = true; // Dit maakt het de "blauwe knop" standaard suggestie
            actions.push(fixAction);
        }

        // --- NIEUW 2: Verbose Boolean Quick Fix ---
        for (const diagnostic of diagnostics) {
            if (diagnostic.message.includes("veel korter schrijven als één regel:")) {
                const action = this.createBooleanFix(document, diagnostic);
                if (action) actions.push(action);
            }
        }

        // 4. CONTEXT: Staat de cursor op een gewone variabele? (Snel-Logger)
        if (range.isEmpty && lineText.trim().length > 0 && !lineText.includes('//') && !lineText.includes('/*')) {
            const debugAction = new vscode.CodeAction('🐛 Snel-Logger (Magic Debug) invoegen', vscode.CodeActionKind.Refactor);
            debugAction.command = { command: 'mispl.magicDebug', title: 'Magic Debug' };
            actions.push(debugAction);
        }

        return actions;
    }

    // --- NIEUWE HELPER FUNCTIE VOOR DE IF-FIX ---
    createBooleanFix(document, diagnostic) {
        const fix = new vscode.CodeAction("💡 Vereenvoudig IF-statement naar één regel", vscode.CodeActionKind.QuickFix);
        fix.diagnostics = [diagnostic];
        fix.isPreferred = true; 

        // Filter de code-tip eruit (lGeldig := ...)
        const match = diagnostic.message.match(/één regel:\s*(.*)$/);
        if (!match) return null;
        const newCode = match[1].trim();

        let startLine = diagnostic.range.start.line;
        let endLine = startLine;
        let depth = 0;

        // Loop naar beneden om de bijbehorende ENDIF te vinden
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

        // Bouw de vervanging op
        const rangeToReplace = new vscode.Range(startLine, 0, endLine, document.lineAt(endLine).text.length);
        const indent = document.lineAt(startLine).text.match(/^\s*/)[0]; // Bewaar inspringing
        
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
                vscode.CodeActionKind.RefactorRewrite,    // NIEUW TOEGEVOEGD
                vscode.CodeActionKind.RefactorExtract     // NIEUW TOEGEVOEGD
            ]
        })
    );
}

module.exports = registerCodeActions;