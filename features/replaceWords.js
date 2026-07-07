// ./features/replaceWords.js
const vscode = require("vscode");
const fs = require("fs");
const path = require("path");
const { t } = require("../i18n"); // 🌍 Importeer de i18n module

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
        vscode.window.showErrorMessage(t('ERR_REPLACE_JSON_FAIL'));
        return;
    }

    // 2. Maak een efficiënte Lookup Map én een gesorteerde sleutellijst
    const lookupMap = new Map();
    const sortedKeys = [];

    for (const [key, value] of Object.entries(replaceList)) {
        const lowerKey = key.toLowerCase();
        lookupMap.set(lowerKey, value);
        sortedKeys.push(lowerKey);
    }

    // Sorteer de sleutels op lengte (langste eerst). 
    sortedKeys.sort((a, b) => b.length - a.length);

    // 🛡️ GLIMS KLASSE BESCHERMING
    // We willen nooit dat woorden die letterlijk de naam van een GLIMS klasse zijn (zoals 'Order') 
    // deels worden verminkt omdat ze toevallig beginnen met een afkorting (zoals 'Ord').
    const protectedClasses = new Set([
        "string", "integer", "fractional", "logical", "date", "time", "datetime", "mnemonic", "void", "any",
        "order", "result", "object", "specimen", "correspondent", "person", "bloodbag", "bloodproduct",
        "ward", "department", "property", "paymentagreement", "policyname"
    ]);

    const fullText = document.getText();

    // 3. De Slimme Regex (pakt hele woorden)
    const tokenizer = /("(?:[^"\\]|\\.)*"|\/\*[\s\S]*?\*\/|\/\/.*)|(\b\w+\b)/g;

    const newText = fullText.replace(tokenizer, (match, protectedContent, word) => {
        // A. Is het een String of Commentaar? Blijf eraf!
        if (protectedContent) {
            return protectedContent;
        }

        // B. Is het een woord?
        if (word) {
            const lowerWord = word.toLowerCase();
            let matchedKey = null;
            let isExactMatch = false;

            // STAP 1: Zoek eerst naar een EXACTE 100% match. 
            // Dit is de veiligste manier (bijv. "Ordr" -> "Ord")
            if (lookupMap.has(lowerWord)) {
                matchedKey = lowerWord;
                isExactMatch = true;
            } 
            // STAP 2: Als er geen exacte match is, kijk of we een "starts with" (prefix) match kunnen maken.
            // Dit is voor constructies zoals "TheResultVorig" -> "rsltVorig".
            else {
                // We slaan deze prefix-check over als het huidige woord een basistype of klasse is!
                // We willen niet dat "Order" (klasse) wordt ge-prefix-matched door "Ord" (variabele).
                if (!protectedClasses.has(lowerWord)) {
                    for (const key of sortedKeys) {
                        if (lowerWord.startsWith(key)) {
                            matchedKey = key;
                            break;
                        }
                    }
                }
            }

            // Hebben we een bruikbare match gevonden?
            if (matchedKey) {
                const replacement = lookupMap.get(matchedKey); 
                
                if (isExactMatch) {
                    return replacement; // Exacte match = exacte vervanging (geen suffix logica nodig)
                } else {
                    let suffix = word.substring(matchedKey.length); 

                    // Als er een achtervoegsel is, zorg dat het netjes met een hoofdletter begint (CamelCase)
                    if (suffix.length > 0) {
                        suffix = suffix.charAt(0).toUpperCase() + suffix.slice(1);
                    }
                    return replacement + suffix;
                }
            }

            // Geen match of beschermd woord? Laat het woord intact.
            return word;
        }

        // Fallback
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
        vscode.window.showInformationMessage(t('MSG_REPLACE_SUCCESS'));
    } else {
        vscode.window.showInformationMessage(t('MSG_REPLACE_NO_MATCH'));
    }
}

module.exports = replaceWords;