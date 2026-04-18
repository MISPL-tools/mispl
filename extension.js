// extension.js
console.log(">>> ACTIVE EXTENSION FILE:", __filename);
console.log(">>> MISPL EXTENSION LOADED FROM:", __dirname);

const vscode = require("vscode");

// === FEATURES ===
const formatMISPL = require("./features/formatter");
const compactCode = require("./features/compactCode");
const minifier = require("./features/minifier");
const alignAssignments = require("./features/alignAssignments");
const removeUnusedVariablesText = require("./features/removeUnusedVariables");
const extractToVariable = require("./features/extractVariable");
const wrapInBlock = require("./features/wrapInBlock");
const replaceWords = require("./features/replaceWords");
const insertMagicDebug = require("./features/magicDebug");
// === Importeer de validatie functies
const { injectValidationFlow, removeValidationFlow } = require("./features/validationFlow");
const { generateCoverageReport } = require('./features/coverageAnalyzer');
// === FLOWCHART / WEBVIEW ===
const misplToMermaid = require("./mermaid/misplToMermaid");
const getWebviewContent = require("./mermaid/webview");

// === STATIC ANALYSIS ===
// Let op: controleer of in jouw mapstructuur de bestanden parser.js en analyzer.js heten,
// OF dat je 'analyzeMISPL.js' gebruikt voor beide. Ik ga er hier vanuit dat 'analyze' en 'VERSION' uit analyzer komen.
const { parseMISPL } = require("./parser"); 
const { analyze, VERSION } = require("./analyzer"); // <-- Nu importeren we VERSION!

// === AST PRINTER ===
const { printAst } = require("./astPrinter");
// === De Hover Documentatie (IntelliSense) ===
const registerHoverProvider = require("./features/hoverProvider");
// === De Code-Map (Document Symbol Provider)
const registerDocumentSymbolProvider = require("./features/documentSymbolProvider");
//=== Context-Sensitive Help (De Slimme Gloeilamp)
const registerCodeActions = require("./features/codeActions");
// === Het MISPL Actiemenu & Statusbalk
const { showActionMenu, createStatusBarItem } = require("./features/actionMenu");
const registerCompletionProvider = require("./features/completionProvider");


/**
 * @param {vscode.ExtensionContext} context
 */
function activate(context) {
    // --- LINTER STATUS IN OUTPUT CONSOLE ---
    const outputChannel = vscode.window.createOutputChannel("GLIMS MISPL Linter");
    const initMessage = `🚀 GLIMS MISPL Linter geactiveerd. Engine: ${VERSION || 'Unknown'}`;
    outputChannel.appendLine(initMessage);
    console.log(`>>> ${initMessage}`);

    console.log("Imported formatter");
    console.log("Imported compactCode");
    console.log("Imported minifier");
    console.log("Imported alignAssignments");
    console.log("Imported removeUnusedVariables");
    console.log("Imported wrapInBlock");
    console.log("Imported replaceWords");
    console.log("Imported validationFlow");
    console.log("Imported documentSymbolProvider");
    console.log("Imported CodeActions");
    console.log("Imported showActionMenu");
    console.log("Imported misplToMermaid");
    console.log("Imported getWebviewContent");
    console.log("Imported parseMISPL");
    console.log("Imported analyze");
    console.log("Imported printAst");


    // =====================================================================
    // DIAGNOSTICS
    // =====================================================================
    const diagnosticCollection = vscode.languages.createDiagnosticCollection("mispl");
    context.subscriptions.push(diagnosticCollection);

    function toVSSeverity(sev) {
        if (sev === 8 || sev === "error") return vscode.DiagnosticSeverity.Error;
        if (sev === 4 || sev === "warning") return vscode.DiagnosticSeverity.Warning;
        if (sev === 2 || sev === "info" || sev === "information")
            return vscode.DiagnosticSeverity.Information;
        return vscode.DiagnosticSeverity.Information;
    }

    function runDiagnostics(document) {
        if (!document || document.languageId !== "mispl") return;

        const code = document.getText();
        let diagnostics = [];

        try {
            const parseResult = parseMISPL(code) || {};
            const ast = parseResult.ast;
            const parseErrors = Array.isArray(parseResult.errors) ? parseResult.errors : [];
            if (parseErrors.length) {
                diagnostics.push(
                    ...parseErrors.map(e => {
                        const line = typeof e.line === "number" ? e.line : 0;
                        return new vscode.Diagnostic(
                            new vscode.Range(line, 0, line, 200),
                            e.message || String(e),
                            toVSSeverity(e.severity)
                        );
                    })
                );
            }

            if (ast && parseErrors.length === 0) {
                let analysisResult;
                try {
                    analysisResult = analyze(parseResult, code) || [];
                } catch (inner) {
                    console.error("UNEXPECTED STATIC ANALYSIS ERROR (analyzer):", inner);
                    analysisResult = [
                        {
                            line: 0,
                            message: "Onverwachte fout in statische analyse: " + String(inner),
                            severity: "error"
                        }
                    ];
                }

                diagnostics.push(
                    ...analysisResult.map(r => {
                        const line = typeof r.line === "number" ? r.line : 0;
                        return new vscode.Diagnostic(
                            new vscode.Range(line, 0, line, 200),
                            r.message || String(r),
                            toVSSeverity(r.severity)
                        );
                    })
                );
            }
        } catch (err) {
            console.error("UNEXPECTED STATIC ANALYSIS ERROR (wrapper):", err);
            diagnostics = [
                new vscode.Diagnostic(
                    new vscode.Range(0, 0, 0, 1),
                    "Onverwachte fout in statische analyse: " + String(err),
                    vscode.DiagnosticSeverity.Error
                )
            ];
        }
        diagnosticCollection.set(document.uri, diagnostics);
    }

    // --- DE VERNIEUWDE LUISTERVINKEN ---
    context.subscriptions.push(
        // 1. Bij openen (of als je de taal van Plain Text naar MISPL verandert)
        vscode.workspace.onDidOpenTextDocument(doc => runDiagnostics(doc)),
        // 2. Bij typen
        vscode.workspace.onDidChangeTextDocument(e => runDiagnostics(e.document)),
        // 3. Bij opslaan
        vscode.workspace.onDidSaveTextDocument(doc => runDiagnostics(doc)),
        // 4. DE FIX: Bij het wisselen van tabblad! (Bijv. naar Untitled-2 klikken)
        vscode.window.onDidChangeActiveTextEditor(editor => {
            if (editor) {
                runDiagnostics(editor.document);
            }
        }),
        // 5. Ruim de foutmeldingen netjes op als we de tab sluiten
        vscode.workspace.onDidCloseTextDocument(doc => {
            diagnosticCollection.delete(doc.uri);
        })
    );

    // 6. DE FIX: Scan direct álle openstaande bestanden als VS Code opstart!
    if (vscode.window.activeTextEditor) {
        runDiagnostics(vscode.window.activeTextEditor.document);
    }
    vscode.workspace.textDocuments.forEach(doc => {
        runDiagnostics(doc);
    });

    context.subscriptions.push(
        vscode.commands.registerCommand("mispl.showStaticAnalysis", () => {
            const editor = vscode.window.activeTextEditor;
            if (editor) {
                runDiagnostics(editor.document);
                vscode.window.showInformationMessage("Statische MISPL-analyse uitgevoerd.");
            }
        })
    );

    // =====================================================================
    // FORMATTER
    // =====================================================================
    context.subscriptions.push(
        vscode.languages.registerDocumentFormattingEditProvider("mispl", {
            provideDocumentFormattingEdits(document) {
                const formatted = formatMISPL(document.getText());
                return [
                    vscode.TextEdit.replace(
                        new vscode.Range(
                            document.lineAt(0).range.start,
                            document.lineAt(document.lineCount - 1).range.end
                        ),
                        formatted
                    )
                ];
            }
        })
    );

    // =====================================================================
    // COMMANDS
    // =====================================================================

    function registerCommand(name, callback) {
        context.subscriptions.push(vscode.commands.registerCommand(name, callback));
    }

    registerCommand("mispl.compactCode", () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) return;
        const doc = editor.document;
        const newText = compactCode(doc.getText());
        editor.edit(edit => {
            edit.replace(new vscode.Range(doc.positionAt(0), doc.positionAt(doc.getText().length)), newText);
        });
    });

    // Start het MISPL Actiemenu (Statusbalk knop)
    createStatusBarItem(context);
    registerCommand("mispl.showActionMenu", showActionMenu);
    // Start de Slimme Autocomplete / Dynamische Snippets
    registerCompletionProvider(context);

    registerCommand("mispl.minifier", () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) return;
        const doc = editor.document;
        const newText = minifier(doc.getText());
        editor.edit(edit => {
            edit.replace(new vscode.Range(doc.positionAt(0), doc.positionAt(doc.getText().length)), newText);
        });
    });

    registerCommand("mispl.alignAssignments", () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) return;
        const sel = editor.selection;
        const aligned = alignAssignments(editor.document.getText(sel));
        editor.edit(edit => edit.replace(sel, aligned));
    });

    registerCommand("mispl.removeUnusedVariables", () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) return;
        const doc = editor.document;
        const newText = removeUnusedVariablesText(doc.getText());
        editor.edit(edit => {
            edit.replace(new vscode.Range(doc.positionAt(0), doc.positionAt(doc.getText().length)), newText);
        });
    });

    registerCommand("mispl.replaceWords", () => replaceWords(context));
    // Magic Debugger Commando
    registerCommand("mispl.magicDebug", insertMagicDebug);

    // Start de IntelliSense Hover Provider
    registerHoverProvider(context);
    // Start de Outline / Document Symbol Provider (Code-Map)
    registerDocumentSymbolProvider(context);
    // Start de Context-Sensitive Help (Gloeilamp / Quick Fixes)
    registerCodeActions(context);

    // Refactoring Commando
    registerCommand("mispl.extractVariable", extractToVariable);

    // Inpakker Commando (Wrap in IF/WHILE)
    registerCommand("mispl.wrapInBlock", wrapInBlock);

    // NIEUW: Commands voor Validation Flow (Altijd vragen om ID)
    let disposableInject = vscode.commands.registerCommand("mispl.injectValidationFlow", async () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) return;

        // Vraag ALTIJD om het MISPL ID met de uitgebreide instructie
        const logId = await vscode.window.showInputBox({
            prompt: "Om het ID van uw MISPL te vinden moet u (1) naar de Sitefuncties gaan, (2) uw MISPL selecteren, (3) als deze er nog niet is: een MISPL-functie (MISPL_ID) op de tabel maken van het type Integer met de code RETURN .ID; (4) de MISPL-functie uitvoeren.",
            placeHolder: "Vul het MISPL ID in (bijv. 12345)",
            ignoreFocusOut: true
        });

        // Als de gebruiker op annuleren klikt of het veld leeg laat
        if (!logId || logId.trim() === "") {
            vscode.window.showWarningMessage("Injectie geannuleerd: Er is een geldig GLIMS MISPL ID nodig om te kunnen loggen.");
            return;
        }

        const doc = editor.document;
        // Injecteer de tekst met het zojuist opgegeven logId
        const newText = injectValidationFlow(doc.getText(), logId.trim());

        editor.edit(edit => {
            edit.replace(new vscode.Range(doc.positionAt(0), doc.positionAt(doc.getText().length)), newText);
        });
        vscode.window.showInformationMessage(`Validation flow succesvol geïnjecteerd met MISPL ID: ${logId.trim()}!`);
    });
    context.subscriptions.push(disposableInject);

    registerCommand("mispl.removeValidationFlow", () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) return;
        const doc = editor.document;
        const newText = removeValidationFlow(doc.getText());
        editor.edit(edit => {
            edit.replace(new vscode.Range(doc.positionAt(0), doc.positionAt(doc.getText().length)), newText);
        });
        vscode.window.showInformationMessage("Validation flow opgeschoond!");
    });

    // Commando: Coverage Analyzer (leest van klembord)
    let disposableCoverage = vscode.commands.registerCommand('mispl.analyzeCoverage', async () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showErrorMessage("Open eerst het geïnjecteerde MISPL script.");
            return;
        }

        // 1. Lees het klembord van de gebruiker (waar de GLIMS logs inzitten)
        const logText = await vscode.env.clipboard.readText();

        if (!logText || !logText.includes("|")) {
            vscode.window.showWarningMessage("Geen geldige GLIMS log-kruimels gevonden op je klembord! Kopieer eerst het logbestand (Ctrl+C).");
            return;
        }

        const misplCode = editor.document.getText();

        // 2. Genereer het rapport
        const reportMd = generateCoverageReport(misplCode, logText, "Huidige MISPL");

        // 3. Open het rapport in een nieuw scherm ernaast
        const doc = await vscode.workspace.openTextDocument({
            content: reportMd,
            language: 'markdown'
        });
        vscode.window.showTextDocument(doc, vscode.ViewColumn.Beside);
    });

    context.subscriptions.push(disposableCoverage);

    // =====================================================================
    // FLOWCHART WEBVIEW
    // =====================================================================
    let flowchartPanel = undefined;

    function showFlowchart(text, title) {
        let mermaid = "";
        let meta = {};

        try {
            const raw = misplToMermaid(text);
            if (typeof raw === "string") mermaid = raw;
            else if (raw && typeof raw === "object" && raw.mermaid) {
                mermaid = raw.mermaid;
                meta = raw.nodeMeta ?? {};
            }
        } catch (e) {
            vscode.window.showErrorMessage("Fout bij MISPL → Mermaid: " + String(e));
            return;
        }

        if (!flowchartPanel) {
            flowchartPanel = vscode.window.createWebviewPanel(
                "misplFlowchart",
                title,
                vscode.ViewColumn.Beside,
                { enableScripts: true, retainContextWhenHidden: true }
            );

            flowchartPanel.webview.html = getWebviewContent(
                flowchartPanel.webview,
                context.extensionUri,
                { mermaid },
                meta
            );

            flowchartPanel.onDidDispose(() => (flowchartPanel = undefined));

            flowchartPanel.webview.onDidReceiveMessage(msg => {
                if (msg.type === "nodeClicked") {
                    const editor = vscode.window.activeTextEditor;
                    if (!editor) return;

                    const line = msg.meta?.line;
                    if (typeof line === "number") {
                        const pos = new vscode.Position(line, 0);
                        editor.selection = new vscode.Selection(pos, pos);
                        editor.revealRange(new vscode.Range(pos, pos));
                    }
                }
            });
        } else {
            flowchartPanel.title = title;
            flowchartPanel.webview.postMessage({
                type: "updateDiagram",
                mermaid,
                meta
            });
        }
    }

    registerCommand("mispl.showFlowchart", () => {
        const editor = vscode.window.activeTextEditor;
        if (editor) showFlowchart(editor.document.getText(), "MISPL Flowchart");
    });

    registerCommand("mispl.showSelectedFlowchart", () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) return;

        const selection = editor.document.getText(editor.selection);
        if (!selection.trim()) {
            vscode.window.showInformationMessage("Geen MISPL code geselecteerd.");
            return;
        }

        showFlowchart(selection, "MISPL Flowchart (Selectie)");
    });

    // =====================================================================
    // NEW FEATURE: SHOW AST
    // =====================================================================
    registerCommand("mispl.printAst", async (uri) => {
        try {
            let source = "";
            const editor = vscode.window.activeTextEditor;

            if (editor && editor.document.languageId === "mispl") {
                source = editor.document.getText();
            }
            else if (uri && uri.fsPath) {
                const fs = require("fs");
                if (fs.existsSync(uri.fsPath) && fs.lstatSync(uri.fsPath).isFile()) {
                    source = fs.readFileSync(uri.fsPath, "utf8");
                } else {
                    vscode.window.showWarningMessage("Selecteer een MISPL-bestand om de AST te tonen.");
                    return;
                }
            } else {
                vscode.window.showErrorMessage("Geen MISPL-bestand actief.");
                return;
            }

            const result = parseMISPL(source);
            if (!result || !result.ast) {
                vscode.window.showErrorMessage("De parser kon geen AST genereren.");
                return;
            }

            const astText = printAst(result.ast);

            const doc = await vscode.workspace.openTextDocument({
                content: astText,
                language: "plaintext"
            });
            await vscode.window.showTextDocument(doc, { preview: false, viewColumn: vscode.ViewColumn.Beside });

        } catch (err) {
            console.error("AST Error:", err);
            vscode.window.showErrorMessage("Fout bij AST: " + err.message);
        }
    });

}

function deactivate() {
    console.log(">>> MISPL EXTENSION DEACTIVATED");
}

module.exports = { activate, deactivate };