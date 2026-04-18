// ./features/documentSymbolProvider.js
const vscode = require('vscode');

class MisplDocumentSymbolProvider {
    provideDocumentSymbols(document, token) {
        const symbols = [];
        const text = document.getText();
        const lines = text.split(/\r?\n/);

        let currentBlock = []; // Deze 'stack' houdt bij in welke IF of WHILE we zitten
        let inBlockComment = false;

        // RegEx om declaraties te herkennen
        const declRegex = /^\s*(String|Integer|Logical|Fractional|Date|DateTime|Time|Material|Specimen|gp_Text|Object|Person|Animal|Request|Order|Action|ItemStorage|Rack|Ward|Correspondent|CorrespondentType|sc_User|Result|BloodBag)\s+([^;]+);/i;

        for (let i = 0; i < lines.length; i++) {
            const lineText = lines[i];
            let cleanLine = lineText.trim();

            // Sla commentaarblokken over
            if (cleanLine.startsWith('/*')) inBlockComment = true;
            if (inBlockComment) {
                if (cleanLine.includes('*/')) inBlockComment = false;
                continue;
            }
            if (!cleanLine || cleanLine.startsWith('//')) continue;

            // 1. Zoek naar Gedeclareerde Variabelen
            const declMatch = cleanLine.match(declRegex);
            if (declMatch) {
                const varType = declMatch[1];
                // Splits op komma's (bijv. "String sNaam, sCode;")
                const varNames = declMatch[2].split(',').map(v => v.trim());

                varNames.forEach(varName => {
                    const startChar = lineText.indexOf(varName) > -1 ? lineText.indexOf(varName) : 0;
                    const symbol = new vscode.DocumentSymbol(
                        varName,
                        varType, // Dit zet de omschrijving (bijv. 'Integer') achter de naam
                        vscode.SymbolKind.Variable,
                        new vscode.Range(i, 0, i, lineText.length),
                        new vscode.Range(i, startChar, i, startChar + varName.length)
                    );
                    
                    // Stop de variabele in het hoofdmenu, of binnen het huidige IF/WHILE blok
                    if (currentBlock.length > 0) {
                        currentBlock[currentBlock.length - 1].children.push(symbol);
                    } else {
                        symbols.push(symbol);
                    }
                });
                continue; // Ga direct door naar de volgende regel
            }

            // 2. Zoek naar Logica Blokken (IF / WHILE / REPEAT)
            const upperLine = cleanLine.toUpperCase();
            if (upperLine.startsWith('IF ') || upperLine.startsWith('WHILE ') || upperLine.startsWith('REPEAT')) {
                let name = cleanLine;
                // Kort extreem lange voorwaarden in voor het zijmenu
                if (name.length > 60) name = name.substring(0, 60) + "..."; 

                // Geef een IF een ander icoontje (Boolean) dan een lus (Array)
                let kind = upperLine.startsWith('IF ') ? vscode.SymbolKind.Boolean : vscode.SymbolKind.Array; 

                const blockSymbol = new vscode.DocumentSymbol(
                    name,
                    upperLine.split(' ')[0], // 'IF', 'WHILE' of 'REPEAT'
                    kind,
                    new vscode.Range(i, 0, i, lineText.length), // Start line
                    new vscode.Range(i, 0, i, lineText.length)
                );

                if (currentBlock.length > 0) {
                    currentBlock[currentBlock.length - 1].children.push(blockSymbol);
                } else {
                    symbols.push(blockSymbol);
                }
                
                // Als de IF of WHILE niet direct op déze regel alweer sluit (één-regelige statements),
                // dan voegen we hem toe aan de stapel, zodat alles wat hierna komt erin valt!
                if (!upperLine.endsWith('ENDIF;') && !upperLine.endsWith('DONE;')) {
                    currentBlock.push(blockSymbol);
                }
            } 
            // 3. Zoek naar het sluiten van de blokken
            else if (upperLine === 'ENDIF;' || upperLine === 'DONE;' || upperLine.startsWith('UNTIL ')) {
                if (currentBlock.length > 0) {
                    // Haal het actieve blok van de stapel en update de eind-regel!
                    const closedBlock = currentBlock.pop();
                    closedBlock.range = new vscode.Range(closedBlock.range.start, new vscode.Position(i, lineText.length));
                }
            }
        }

        return symbols;
    }
}

function registerDocumentSymbolProvider(context) {
    context.subscriptions.push(
        vscode.languages.registerDocumentSymbolProvider('mispl', new MisplDocumentSymbolProvider())
    );
}

module.exports = registerDocumentSymbolProvider;