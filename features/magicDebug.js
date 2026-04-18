// ./features/magicDebug.js
const vscode = require('vscode');

async function insertMagicDebug() {
    try {
        const editor = vscode.window.activeTextEditor;
        if (!editor) return;

        const document = editor.document;
        let selection = editor.selection;
        let word = "";

        // Als er geen tekst is geselecteerd, pakken we het woord waar de cursor in staat
        if (selection.isEmpty) {
            const wordRange = document.getWordRangeAtPosition(selection.start, /[\w.]+/);
            if (wordRange) {
                word = document.getText(wordRange);
            }
        } else {
            word = document.getText(selection).trim();
        }

        if (!word) {
            vscode.window.showWarningMessage("⚠️ MISPL Debug: Zet je cursor in een variabele (of selecteer er een) om te loggen.");
            return;
        }

        // --- 🛡️ DE NIEUWE DECLARATIE SCANNER ---
        const fullText = document.getText();
        const declaredVars = new Set();
        
        // Scan het hele document op declaraties (werkt ook met meerdere vars per regel: "String sUser, sTest;")
        const typeRegex = /^\s*(String|Integer|Logical|Fractional|DateTime|Date|Time|Object|Person|Specimen|Order|Result)\b([^;]+);/gim;
        let match;
        while ((match = typeRegex.exec(fullText)) !== null) {
            // match[2] is alles na het type. Splits op komma en haal spaties weg.
            const vars = match[2].split(',').map(v => v.trim());
            vars.forEach(v => declaredVars.add(v));
        }

        // We checken of het een ingebouwd object of veld is (die hoeven niet gedeclareerd te zijn)
        const isBaseObject = /^(obj|ordr|rslt|prsn|spmn|mat|actn|crsp)/i.test(word) && !word.includes(".");
        const isObjectField = word.includes(".");

        // De ultieme check: Is het géén base object, géén veld, en NIET gedeclareerd? Dan is het wrs. een functie!
        if (!isBaseObject && !isObjectField && !declaredVars.has(word)) {
            vscode.window.showErrorMessage(`❌ Magic Debug Fout: Kan '${word}' niet debuggen. Dit is een functie of een niet-gedeclareerde variabele!`);
            return; // Abort mission!
        }
        // -----------------------------------------

        // --- DE GLIMS GEBRUIKERSNAAM LOGICA ---
        const config = vscode.workspace.getConfiguration('mispl');
        let glimsUser = config.get('glimsUsername');

        // Als de instelling nog leeg is (de allereerste keer)
        if (!glimsUser || glimsUser.trim() === "") {
            const windowsUser = process.env.USERNAME || process.env.USER || "ONBEKEND";
            
            const answer = await vscode.window.showInformationMessage(
                `Controleer inlognaam GLIMS. Is deze: "${windowsUser}"?`,
                "Ja", "Nee, pas aan"
            );

            if (answer === "Ja") {
                glimsUser = windowsUser;
                await config.update('glimsUsername', glimsUser, vscode.ConfigurationTarget.Global);
                vscode.window.showInformationMessage(`Top! Inlognaam '${glimsUser}' is opgeslagen in je instellingen.`);
            } else if (answer === "Nee, pas aan") {
                const customName = await vscode.window.showInputBox({
                    prompt: "Vul hier je daadwerkelijke GLIMS inlognaam in:",
                    placeHolder: "bijv. jansend",
                    value: windowsUser !== "ONBEKEND" ? windowsUser : ""
                });

                if (customName && customName.trim() !== "") {
                    glimsUser = customName.trim();
                    await config.update('glimsUsername', glimsUser, vscode.ConfigurationTarget.Global);
                    vscode.window.showInformationMessage(`Top! Inlognaam '${glimsUser}' is opgeslagen in je instellingen.`);
                } else {
                    vscode.window.showWarningMessage("Actie geannuleerd: Geen GLIMS naam ingevuld.");
                    return; 
                }
            } else {
                return; 
            }
        }
        // ----------------------------------------

        let debugStatement = "";
        const currentLine = document.lineAt(selection.start.line);
        const indent = currentLine.text.substring(0, currentLine.firstNonWhitespaceCharacterIndex);

        if (isBaseObject) {
            // De veilige methode voor objecten: check op <>? en print geen interne data
            debugStatement = `\n${indent}IF CurrentUser()="${glimsUser}" AND ${word}<>? THEN Message("Debug=${word}"); ENDIF;`;
            
        } else if (/^(l|b)[A-Z_]/.test(word)) {
            // DE FIX VOOR LOGICALS
            debugStatement = `\n${indent}IF CurrentUser()="${glimsUser}" THEN IF ${word} THEN Message("DEBUG ${word}: TRUE"); ELSE Message("DEBUG ${word}: FALSE"); ENDIF; ENDIF;`;
            
        } else {
            // Bepaal de exacte conversie voor normale variabelen
            let safePrint = `ToString(${word})`; 
            
            if (/^(s|sl|stl)[A-Z_]/.test(word)) {
                safePrint = `IfKnownString(${word})`; 
            } else if (/^i[A-Z_]/.test(word)) {
                safePrint = `IntegerToString(${word}, "%d")`; 
            } else if (/^f[A-Z_]/.test(word)) {
                safePrint = `FractionalToString(${word}, "%f")`; 
            } else if (/^dt[A-Z_]/.test(word)) {
                safePrint = `DateTimeToString(${word}, "%d-%m-%Y %H:%M")`; 
            } else if (/^d[A-Z_]/.test(word)) {
                safePrint = `DateToString(${word}, "%d-%m-%Y")`; 
            } else if (/^tm[A-Z_]/.test(word)) {
                safePrint = `TimeToString(${word}, "%H:%M")`; 
            }

            // Normale variabelen: Print de inhoud veilig uit
            debugStatement = `\n${indent}IF CurrentUser()="${glimsUser}" THEN Message("DEBUG ${word}: " + ${safePrint}); ENDIF;`;
        }

        // Voeg de regel direct in ónder de huidige regel
        await editor.edit(editBuilder => {
            const insertPos = new vscode.Position(selection.start.line, currentLine.range.end.character);
            editBuilder.insert(insertPos, debugStatement);
        });

    } catch (err) {
        vscode.window.showErrorMessage("❌ Onverwachte fout in Magic Debug: " + err.message);
    }
}

module.exports = insertMagicDebug;