const vscode = require("vscode");
const fs = require("fs");
const path = require("path");

function replaceWords(context) {
    const editor = vscode.window.activeTextEditor;
    if (!editor) return;

    const document = editor.document;
    
    // 1. Lees de JSON in
    const replaceFilePath = path.join(context.extensionPath, "replaceWords.json");
    let replaceList;
    try {
        const raw = fs.readFileSync(replaceFilePath, "utf8");
        replaceList = JSON.parse(raw);
    } catch (err) {
        vscode.window.showErrorMessage("Kon replaceWords.json niet lezen.");
        return;
    }

    // 2. Maak een efficiënte Lookup Map (voor case-insensitive zoeken)
    // We zetten alle keys om naar lowercase zodat we makkelijk kunnen vinden.
    const lookupMap = new Map();
    for (const [key, value] of Object.entries(replaceList)) {
        lookupMap.set(key.toLowerCase(), value);
    }

    const fullText = document.getText();

    // 3. De Slimme Regex
    // Group 1: Strings ("...") OF Block Comment (/*...*/) OF Line Comment (//...)
    // Group 2: Woorden (\b\w+\b) -> Alleen hele woorden!
    const tokenizer = /("(?:[^"\\]|\\.)*"|\/\*[\s\S]*?\*\/|\/\/.*)|(\b\w+\b)/g;

    const newText = fullText.replace(tokenizer, (match, protectedContent, word) => {
        // A. Is het een String of Commentaar?
        if (protectedContent) {
            return protectedContent; // NIET AANRAKEN, stuur exact terug wat het was
        }

        // B. Is het een woord?
        if (word) {
            // Check of dit woord in onze lijst staat (case-insensitive check)
            const replacement = lookupMap.get(word.toLowerCase());
            
            // Staat het in de lijst? Vervang het. Zo niet? Laat het woord staan.
            if (replacement) {
                // Optioneel: Wil je de casing van het originele woord respecteren?
                // Voor nu vervangen we het hard door de waarde uit de JSON (bijv "Rslt")
                return replacement;
            }
            return word;
        }

        // Fallback (zou niet moeten gebeuren met deze regex)
        return match;
    });

    // 4. Update de editor alleen als er iets veranderd is
    if (fullText !== newText) {
        editor.edit(edit => {
            edit.replace(
                new vscode.Range(
                    document.positionAt(0),
                    document.positionAt(fullText.length)
                ),
                newText
            );
        });
        vscode.window.showInformationMessage("Code termen bijgewerkt naar nieuwe standaard!");
    } else {
        vscode.window.showInformationMessage("Geen termen gevonden om te vervangen.");
    }
}

module.exports = replaceWords;