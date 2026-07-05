// ./features/completionProvider.js
const vscode = require('vscode');
const { t } = require('../i18n'); // 🌍 Importeer de i18n module

function registerCompletionProvider(context) {
    const provider = vscode.languages.registerCompletionItemProvider(
        'mispl', // Alleen actief in MISPL bestanden
        {
            provideCompletionItems(document, position) {
                // Kijk wat er vooraan de huidige regel staat
                const linePrefix = document.lineAt(position).text.substr(0, position.character);

                // 1. Verberg bij declaraties (Bemoei je er niet mee!)
                if (/^\s*(String|Integer|Logical|Fractional|DateTime|Date|Time|Object|Person|Specimen|Order|Result)\b/i.test(linePrefix)) {
                    return undefined; 
                }

                // Haal de opgeslagen GLIMS naam op
                const config = vscode.workspace.getConfiguration('mispl');
                let glimsUser = config.get('glimsUsername');

                // Fallback voor als hij écht nog leeg is
                if (!glimsUser || glimsUser.trim() === "") {
                    glimsUser = process.env.USERNAME || process.env.USER || "ONBEKEND";
                }

                let snippets = [];

                // --- Slimme Snippet 1: De snelle check ---
                const userCheck = new vscode.CompletionItem('CurrentUser()="MijnNaam"', vscode.CompletionItemKind.Snippet);
                userCheck.insertText = new vscode.SnippetString(`CurrentUser()="${glimsUser}"`);
                userCheck.documentation = new vscode.MarkdownString(t('COMPL_USER_DOC', glimsUser));
                userCheck.detail = t('COMPL_USER_DETAIL', glimsUser);
                snippets.push(userCheck);

                // --- Slimme Snippet 2: Een heel IF blok ---
                const debugBlock = new vscode.CompletionItem(t('COMPL_BLOCK_LBL'), vscode.CompletionItemKind.Snippet);
                debugBlock.insertText = new vscode.SnippetString(`IF CurrentUser()="${glimsUser}" THEN\n\t$1\nENDIF;`);
                debugBlock.documentation = new vscode.MarkdownString(t('COMPL_BLOCK_DOC'));
                debugBlock.detail = t('COMPL_BLOCK_DETAIL');
                snippets.push(debugBlock);

                // --- Context-Awareness voor Assignments ---
                // We kijken of de gebruiker zelf al ':=' heeft getypt
                const hasAssignment = /:=/.test(linePrefix);

                if (!hasAssignment) {
                    // Situatie A: De gebruiker is nét begonnen met typen (bijv. "sCu")
                    const assignUser = new vscode.CompletionItem('sCurrUser:=CurrentUser()', vscode.CompletionItemKind.Snippet);
                    
                    // FilterText is een trucje: hierdoor triggert hij op "sCu", "Curr", én "Assign" in het menu
                    assignUser.filterText = 'sCurrUser Assign CurrentUser'; 
                    assignUser.insertText = new vscode.SnippetString(`\${1:sCurrUser}:=CurrentUser();\n$0`);
                    assignUser.documentation = new vscode.MarkdownString(t('COMPL_ASSIGN_DOC'));
                    assignUser.detail = t('COMPL_ASSIGN_DETAIL');
                    snippets.push(assignUser);
                } else {
                    // Situatie B: De gebruiker heeft al iets getypt als 'sUser := '
                    // We geven nu een pure, schone functie terug zonder 'sCurrUser:=' ervoor!
                    const pureFunction = new vscode.CompletionItem(t('COMPL_PURE_LBL'), vscode.CompletionItemKind.Snippet);
                    pureFunction.insertText = new vscode.SnippetString(`CurrentUser()`);
                    pureFunction.documentation = new vscode.MarkdownString(t('COMPL_PURE_DOC'));
                    pureFunction.detail = t('COMPL_PURE_DETAIL');
                    snippets.push(pureFunction);
                }

                return snippets;
            }
        }
    );

    context.subscriptions.push(provider);
}

module.exports = registerCompletionProvider;