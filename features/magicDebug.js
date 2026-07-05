// ./features/magicDebug.js
const vscode = require('vscode');
const { t } = require('../i18n'); // 🌍 Importeer de i18n module

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
            vscode.window.showWarningMessage(t('WARN_DEBUG_NO_VAR'));
            return;
        }

        // --- 🛠️ DE FIX: INPUT SCHOONMAKEN ---
        // Als de gebruiker een hele regel zoals "sTmp := Entry(I,slRqsts);" selecteert,
        // pakken we alleen het deel vóór de ':=' en gooien we puntkomma's weg.
        if (word.includes(":=")) {
            word = word.split(":=")[0];
        }
        word = word.replace(/;/g, '').trim();
        // -----------------------------------------

        const isBaseObject = /^(obj|ordr|rslt|prsn|spmn|mat|actn|crsp)/i.test(word) && !word.includes(".");

        // 🗑️ De strenge "is dit wel gedeclareerd?!" check is hier volledig verwijderd!
        // De tool vertrouwt nu gewoon op de programmeur.

        // --- DE GLIMS GEBRUIKERSNAAM LOGICA ---
        const config = vscode.workspace.getConfiguration('mispl');
        let glimsUser = config.get('glimsUsername');

        // Als de instelling nog leeg is (de allereerste keer)
        if (!glimsUser || glimsUser.trim() === "") {
            const windowsUser = process.env.USERNAME || process.env.USER || t('DEBUG_UNKNOWN_USER');
            
            // 🚀 Taalonafhankelijke knoppen
            const btnYes = t('BTN_YES');
            const btnNo = t('BTN_NO_EDIT');

            const answer = await vscode.window.showInformationMessage(
                t('PROMPT_DEBUG_CHECK_USER', windowsUser),
                btnYes, btnNo
            );

            if (answer === btnYes) {
                glimsUser = windowsUser;
                await config.update('glimsUsername', glimsUser, vscode.ConfigurationTarget.Global);
                vscode.window.showInformationMessage(t('MSG_DEBUG_USER_SAVED', glimsUser));
            } else if (answer === btnNo) {
                const customName = await vscode.window.showInputBox({
                    prompt: t('PROMPT_DEBUG_ENTER_USER'),
                    placeHolder: t('PLACEHOLDER_DEBUG_USER'),
                    value: windowsUser !== t('DEBUG_UNKNOWN_USER') ? windowsUser : ""
                });

                if (customName && customName.trim() !== "") {
                    glimsUser = customName.trim();
                    await config.update('glimsUsername', glimsUser, vscode.ConfigurationTarget.Global);
                    vscode.window.showInformationMessage(t('MSG_DEBUG_USER_SAVED', glimsUser));
                } else {
                    vscode.window.showWarningMessage(t('WARN_DEBUG_CANCELLED'));
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
        vscode.window.showErrorMessage(t('ERR_DEBUG_UNEXPECTED', err.message));
    }
}

module.exports = insertMagicDebug;