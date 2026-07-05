// ./features/extractVariable.js
const vscode = require('vscode');
const { t } = require('../i18n'); // 🌍 Importeer i18n

async function extractToVariable() {
    try {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showErrorMessage(t('ERR_NO_EDITOR'));
            return;
        }

        const selection = editor.selection;
        if (selection.isEmpty) {
            vscode.window.showErrorMessage(t('ERR_NO_SELECTION'));
            return;
        }

        let selectedText = editor.document.getText(selection).trim();
        selectedText = selectedText.replace(/;$/, "");

        const document = editor.document;
        const fullText = document.getText();

        // 1. Maak een "veilige" kopie van de tekst (strip commentaar en strings)
        // Zo voorkomen we dat hij per ongeluk Ordr.ID ín een logtekst vervangt!
        let workText = fullText.replace(/\/\*[\s\S]*?\*\//g, match => match.replace(/[^\r\n]/g, " "));
        workText = workText.replace(/"[^"]*"/g, match => " ".repeat(match.length));
        workText = workText.replace(/\/\/.*$/gm, match => " ".repeat(match.length));

        // 2. Zoek alle échte instanties van de geselecteerde code
        let occurrences = [];
        // Zorg dat we hele woorden zoeken als we een woord selecteren (bijv. 'I')
        let regexStr = selectedText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        if (/^\w/.test(selectedText)) regexStr = "\\b" + regexStr;
        if (/\w$/.test(selectedText)) regexStr = regexStr + "\\b";
        const searchRegex = new RegExp(regexStr, "g");

        let match;
        while ((match = searchRegex.exec(workText)) !== null) {
            const startPos = document.positionAt(match.index);
            const endPos = document.positionAt(match.index + selectedText.length);
            occurrences.push(new vscode.Range(startPos, endPos));
        }

        // 3. Vraag wat we moeten doen bij meerdere resultaten
        let rangesToReplace = [selection];
        if (occurrences.length > 1) {
            // 🚀 Taalonafhankelijke opties
            const optAll = t('EXTRACT_REPLACE_ALL', occurrences.length);
            const optOne = t('EXTRACT_REPLACE_ONE');

            const choice = await vscode.window.showQuickPick(
                [optAll, optOne],
                {
                    placeHolder: t('EXTRACT_PROMPT_MULTIPLE', selectedText, occurrences.length),
                    ignoreFocusOut: true
                }
            );

            if (!choice) return;
            if (choice === optAll) {
                rangesToReplace = occurrences;
            }
        }

        // 4. Vraag om de nieuwe variabelenaam
        const varName = await vscode.window.showInputBox({
            prompt: t('EXTRACT_PROMPT_NAME', selectedText),
            placeHolder: t('EXTRACT_PLACEHOLDER_NAME'),
            ignoreFocusOut: true
        });

        if (!varName || varName.trim() === "") return; 

        const cleanVarName = varName.trim();
        let varType = "String"; 
        let typeGuessed = false;

        // Raad het datatype (Hongaarse Notatie en GLIMS-objecten)
        if (/^i[A-Z]/.test(cleanVarName)) { varType = "Integer"; typeGuessed = true; }
        else if (/^s[A-Z]/.test(cleanVarName)) { varType = "String"; typeGuessed = true; }
        else if (/^l[A-Z]/.test(cleanVarName)) { varType = "Logical"; typeGuessed = true; }
        else if (/^f[A-Z]/.test(cleanVarName)) { varType = "Fractional"; typeGuessed = true; }
        else if (/^dt[A-Z]/.test(cleanVarName)) { varType = "DateTime"; typeGuessed = true; }
        else if (/^d[A-Z]/.test(cleanVarName)) { varType = "Date"; typeGuessed = true; }
        else if (/^tm[A-Z]/.test(cleanVarName)) { varType = "Time"; typeGuessed = true; }
        else if (/^crsp[A-Z]/.test(cleanVarName)) { varType = "Correspondent"; typeGuessed = true; }
        else if (/^spmn[A-Z]/.test(cleanVarName)) { varType = "Specimen"; typeGuessed = true; }
        else if (/^ordr[A-Z]/.test(cleanVarName)) { varType = "Order"; typeGuessed = true; }
        else if (/^rslt[A-Z]/.test(cleanVarName)) { varType = "Result"; typeGuessed = true; }
        else if (/^prsn[A-Z]/.test(cleanVarName)) { varType = "Person"; typeGuessed = true; }
        else if (/^obj[A-Z]/.test(cleanVarName)) { varType = "Object"; typeGuessed = true; }
        else if (/^mat[A-Z]/.test(cleanVarName)) { varType = "Material"; typeGuessed = true; }
        else if (/^rqst[A-Z]/.test(cleanVarName)) { varType = "Request"; typeGuessed = true; }
        else if (/^actn[A-Z]/.test(cleanVarName)) { varType = "Action"; typeGuessed = true; }
        else if (/^enum[A-Z]/.test(cleanVarName)) { varType = "CorrespondentType"; typeGuessed = true; }

        if (!typeGuessed) {
            const optOther = t('EXTRACT_TYPE_OTHER');
            const typeList = [
                "String", "Integer", "Logical", "Fractional", "Date", "DateTime", "Time", 
                "Correspondent", "CorrespondentType", "Object", "Person", "Specimen", "Order", "Result", 
                "Material", "Request", "Action", "gp_Text", "Animal", "Rack", "ItemStorage", 
                "Ward", optOther
            ];

            const selectedType = await vscode.window.showQuickPick(typeList, {
                placeHolder: t('EXTRACT_PROMPT_TYPE', cleanVarName),
                ignoreFocusOut: true
            });

            if (!selectedType) return; 

            if (selectedType === optOther) {
                varType = await vscode.window.showInputBox({ prompt: t('EXTRACT_PROMPT_EXACT_TYPE'), ignoreFocusOut: true });
                if (!varType || varType.trim() === "") return;
            } else {
                varType = selectedType;
            }
        }

        // 5. Bepaal waar we veilig kunnen toevoegen (Declaratie blok vinden)
        let lastDeclLine = -1;
        let inBlockComment = false;
        const knownTypes = /^\s*(String|Integer|Logical|Fractional|Date|DateTime|Time|Material|Specimen|gp_Text|Object|Person|Animal|Request|Order|Action|ItemStorage|Rack|Ward|Correspondent|CorrespondentType|sc_User|Result|BloodBag)\b/i;
        const safeLines = workText.split(/\r?\n/);

        for (let i = 0; i < document.lineCount; i++) {
            let line = document.lineAt(i).text.trim();
            if (line.startsWith("/*")) inBlockComment = true;
            if (inBlockComment) {
                if (line.includes("*/")) inBlockComment = false;
                lastDeclLine = i;
                continue;
            }
            if (line.startsWith("//") || line.startsWith("/*@V*/")) {
                lastDeclLine = i;
                continue;
            }
            if (knownTypes.test(line)) {
                lastDeclLine = i;
            } else if (line !== "") {
                break;
            }
        }
        const insertDeclPos = new vscode.Position(lastDeclLine + 1, 0);

        // 6. DE SCOPE HOISTING MAGIE (Stamboom maken van alle IF/WHILE blokken)
        let currentPath = [];
        let blockCounter = 0;
        let linePaths = []; // Bewaart voor elke regel hoe 'diep' hij zit

        for (let i = 0; i < safeLines.length; i++) {
            linePaths[i] = [...currentPath];
            let cleanTokens = safeLines[i].toUpperCase().match(/\b(IF|WHILE|REPEAT|ENDIF|DONE|UNTIL|ELSE)\b/g) || [];
            
            for (let token of cleanTokens) {
                if (token === "IF" || token === "WHILE" || token === "REPEAT") {
                    blockCounter++;
                    currentPath.push(blockCounter);
                } else if (token === "ENDIF" || token === "DONE" || token === "UNTIL") {
                    currentPath.pop();
                } else if (token === "ELSE") {
                    currentPath.pop();
                    blockCounter++;
                    currentPath.push(blockCounter);
                }
            }
        }

        // Zoek de gemeenschappelijke "voordeur" (Lowest Common Ancestor) van alle te vervangen items
        let targetScopeDepth = linePaths[rangesToReplace[0].start.line].length;
        for (let i = 1; i < rangesToReplace.length; i++) {
            let path1 = linePaths[rangesToReplace[0].start.line];
            let path2 = linePaths[rangesToReplace[i].start.line];
            let commonLen = 0;
            while (commonLen < path1.length && commonLen < path2.length && path1[commonLen] === path2[commonLen]) {
                commonLen++;
            }
            targetScopeDepth = Math.min(targetScopeDepth, commonLen);
        }

        // Wandel omhoog vanaf de eerste vondst, net zolang tot we uit de IF/WHILE lussen zijn gebroken
        let insertAssignmentLine = rangesToReplace[0].start.line;
        while (insertAssignmentLine > (lastDeclLine + 1) && linePaths[insertAssignmentLine].length > targetScopeDepth) {
            insertAssignmentLine--;
        }

        // 7. Voer alle wijzigingen uit!
        const declarationText = `${varType}\t\t${cleanVarName};\n`;
        const indent = document.lineAt(insertAssignmentLine).text.substring(0, document.lineAt(insertAssignmentLine).firstNonWhitespaceCharacterIndex);
        const assignmentText = `${indent}${cleanVarName} := ${selectedText};\n`;

        const success = await editor.edit(editBuilder => {
            editBuilder.insert(insertDeclPos, declarationText);
            editBuilder.insert(new vscode.Position(insertAssignmentLine, 0), assignmentText);
            
            for (const range of rangesToReplace) {
                editBuilder.replace(range, cleanVarName);
            }
        });

        if (!success) {
            vscode.window.showErrorMessage(t('ERR_EXTRACT_VSCODE_DENIED'));
        } else {
            vscode.window.showInformationMessage(t('MSG_EXTRACT_SUCCESS'));
        }

    } catch (err) {
        vscode.window.showErrorMessage(t('ERR_EXTRACT_UNEXPECTED', err.message));
    }
}

module.exports = extractToVariable;