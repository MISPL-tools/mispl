// ./features/wrapInBlock.js
const vscode = require('vscode');
const { t } = require('../i18n'); // 🌍 Importeer de i18n module

async function wrapInBlock() {
    const editor = vscode.window.activeTextEditor;
    if (!editor) return;

    const selection = editor.selection;
    if (selection.isEmpty) {
        vscode.window.showWarningMessage(t('ERR_WRAP_NO_SELECTION'));
        return;
    }

    // De optie voor commentaar is taalonafhankelijk gemaakt
    const optComment = t('WRAP_COMMENT');

    // 1. Vraag welk type blok de gebruiker wil
    const blockType = await vscode.window.showQuickPick(
        ["IF ... THEN", "WHILE ... DO", "REPEAT ... UNTIL", optComment],
        { placeHolder: t('WRAP_PROMPT'), ignoreFocusOut: true }
    );

    if (!blockType) return; // Gebruiker heeft geannuleerd

    const document = editor.document;
    
    // 2. Bepaal de huidige inspringing (hoe ver staat de tekst al naar rechts?)
    const firstLine = document.lineAt(selection.start.line);
    const baseIndent = firstLine.text.substring(0, firstLine.firstNonWhitespaceCharacterIndex);
    
    // Bepaal of de gebruiker Tabs of Spaties gebruikt in VS Code
    const tabSize = editor.options.tabSize || 4;
    const insertSpaces = editor.options.insertSpaces;
    const indentString = insertSpaces ? " ".repeat(tabSize) : "\t";

    // 3. Haal de geselecteerde tekst op en voeg extra inspringing toe
    const selectedText = document.getText(selection);
    const lines = selectedText.split(/\r?\n/);
    
    const indentedLines = lines.map(line => {
        // Lege regels laten we met rust, de rest schuiven we 1 niveau in
        return line.trim() === "" ? line : indentString + line;
    });
    const indentedText = indentedLines.join("\n");

    let newText = "";
    let startLineOffset = 0;
    let charOffset = 0;
    let selectCondition = true; // Bij commentaar hoeven we geen 'TRUE' te selecteren

    // 4. Bouw het nieuwe codeblok op basis van de keuze
    if (blockType === "IF ... THEN") {
        newText = `${baseIndent}IF TRUE THEN\n${indentedText}\n${baseIndent}ENDIF;`;
        startLineOffset = 0; 
        charOffset = baseIndent.length + 3; // "IF " is 3 tekens
    } else if (blockType === "WHILE ... DO") {
        newText = `${baseIndent}WHILE TRUE DO\n${indentedText}\n${baseIndent}DONE;`;
        startLineOffset = 0;
        charOffset = baseIndent.length + 6; // "WHILE " is 6 tekens
    } else if (blockType === "REPEAT ... UNTIL") {
        newText = `${baseIndent}REPEAT\n${indentedText}\n${baseIndent}UNTIL TRUE;`;
        startLineOffset = lines.length + 1; // De UNTIL staat helemaal onderaan
        charOffset = baseIndent.length + 6; // "UNTIL " is 6 tekens
    } else if (blockType === optComment) {
        // Bij commentaar laten we de inspringing van de code zelf met rust
        if (lines.length === 1) {
            newText = `/* ${selectedText} */`;
        } else {
            newText = `/*\n${selectedText}\n${baseIndent}*/`;
        }
        selectCondition = false; 
    }

    // 5. Voer de wijziging door in de editor
    await editor.edit(editBuilder => {
        editBuilder.replace(selection, newText);
    });

    // 6. Selecteer het woordje "TRUE" zodat de analist direct de voorwaarde kan typen!
    if (selectCondition) {
        const targetLine = selection.start.line + startLineOffset;
        const startPos = new vscode.Position(targetLine, charOffset);
        const endPos = new vscode.Position(targetLine, charOffset + 4); // "TRUE" is 4 letters
        
        editor.selection = new vscode.Selection(startPos, endPos);
    }
}

module.exports = wrapInBlock;