// ./features/actionMenu.js
const vscode = require('vscode');

async function showActionMenu() {
    // Hier definiëren we alle tools met hun bijbehorende kleurrijke emoji's
    const items = [
        {
            label: '✂️ Extract to Variable',
            description: 'Refactor',
            detail: 'Haalt de geselecteerde tekst eruit en plaatst deze in een nieuwe variabele.',
            command: 'mispl.extractVariable'
        },
        {
            label: '🐛 Magic Debug',
            description: 'Log',
            detail: 'Voegt direct een veilige Message/Log regel in voor de geselecteerde variabele.',
            command: 'mispl.magicDebug'
        },
        {
            label: '🎁 Wrap in IF / WHILE',
            description: 'Code',
            detail: 'Pakt de geselecteerde code netjes in met een IF of WHILE blok.',
            command: 'mispl.wrapInBlock'
        },
        {
            label: '📏 Align Assignments',
            description: 'Opmaak',
            detail: 'Lijnt alle := toewijzingen in de selectie (of het hele document) verticaal uit.',
            command: 'mispl.alignAssignments'
        },
        {
            label: '🧹 Remove Unused Variables',
            description: 'Opruimen',
            detail: 'Verwijdert declaraties van variabelen die nergens worden gebruikt.',
            command: 'mispl.removeUnusedVariables'
        },
        {
            label: '🔄 Replace Words',
            description: 'Opruimen',
            detail: 'Vervangt woorden op basis van een vooraf ingestelde lijst.',
            command: 'mispl.replaceWords'
        },
        {
            label: '📦 Compact Code',
            description: 'Productie',
            detail: 'Verwijdert onnodige witregels en spaties voor een strak script.',
            command: 'mispl.compactCode'
        },
        {
            label: '🗜️ Minifier',
            description: 'Productie',
            detail: 'Verwijdert witregels, spaties én commentaar voor productie (max. 31k karakters).',
            command: 'mispl.minifier'
        },
        {
            label: '🖼️ Show Flowchart',
            description: 'Visualisatie',
            detail: 'Genereert een interactieve flowchart van het héle script.',
            command: 'mispl.showFlowchart'
        },
        {
            label: '📍 Show Selected Flowchart',
            description: 'Visualisatie',
            detail: 'Genereert een flowchart van alleen de geselecteerde code.',
            command: 'mispl.showSelectedFlowchart'
        },
        {
            label: '💉 Inject Validation Flow',
            description: 'Testen',
            detail: 'Voegt traceer-code (breadcrumbs) toe voor GLIMS logging.',
            command: 'mispl.injectValidationFlow'
        },
        {
            label: '📈 Analyze Coverage',
            description: 'Testen',
            detail: 'Analyseert GLIMS logs vanaf je klembord om dode code te vinden.',
            command: 'mispl.analyzeCoverage'
        },
        {
            label: '🧽 Remove Validation Flow',
            description: 'Testen',
            detail: 'Verwijdert de geïnjecteerde traceer-code weer veilig uit je script.',
            command: 'mispl.removeValidationFlow'
        }
    ];

    const options = {
        matchOnDescription: true,
        matchOnDetail: true,
        placeHolder: 'Kies een MISPL tool om uit te voeren...'
    };

    // Toon het menu aan de gebruiker
    const selected = await vscode.window.showQuickPick(items, options);

    // Voer het gekozen commando uit
    if (selected) {
        vscode.commands.executeCommand(selected.command);
    }
}

// Deze functie maakt het knopje rechtsonder in de blauwe statusbalk aan
function createStatusBarItem(context) {
    const statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    statusBarItem.command = 'mispl.showActionMenu';
    // Let op: In de statusbalk zélf houden we wel de monochrome $(tools) van VS Code, 
    // want emoji's in de statusbalk breken soms de uitlijning van het hele venster!
    statusBarItem.text = '$(tools) MISPL Tools';
    statusBarItem.tooltip = 'Klik hier om het MISPL actiemenu met uitleg te openen';
    statusBarItem.show();
    context.subscriptions.push(statusBarItem);
}

module.exports = { showActionMenu, createStatusBarItem };