function compactCode(text) {
    const placeholders = [];
    
    // STAP 1: Bepaal het type enter (voor later gebruik bij samenvoegen)
    const eol = text.includes("\r\n") ? "\r\n" : "\n";

    // STAP 2: Maskeren & Strings Platlaan
    // We zoeken naar:
    // 1. Strings: "..." (inclusief multiline)
    // 2. Blok commentaar: /* ... */
    // 3. Regel commentaar: // ...
    const tokenRegex = /("(?:[^"\\]|\\.|[\r\n])*"|\/\*[\s\S]*?\*\/|\/\/.*)/g;

    let protectedText = text.replace(tokenRegex, (match) => {
        // CHECK: Is dit een string? (begint met dubbele quote)
        if (match.startsWith('"')) {
            // VERWIJDER enters binnen de string.
            // Spaties blijven staan, waardoor de indentatie van de volgende regel
            // achter de tekst van de vorige regel wordt geplakt.
            match = match.replace(/[\r\n]+/g, "");
        }
        
        // Als het commentaar is (begint met /), doen we niets en bewaren we het intact.

        placeholders.push(match);
        return `___TOKEN_${placeholders.length - 1}___`;
    });

    // STAP 3: Regels opschonen (Code structuur)
    let lines = protectedText.split(/\r?\n/);
    let cleanLines = [];
    let emptyLineCount = 0;

    for (let line of lines) {
        let trimmed = line.trim();

        if (trimmed.length === 0) {
            // Lege regel logica: Maximaal 1 toestaan
            if (cleanLines.length > 0 && emptyLineCount < 1) {
                cleanLines.push("");
                emptyLineCount++;
            }
        } else {
            cleanLines.push(trimmed);
            emptyLineCount = 0;
        }
    }

    // STAP 3b: Verwijder lege regels aan het EINDE
    while (cleanLines.length > 0 && cleanLines[cleanLines.length - 1] === "") {
        cleanLines.pop();
    }
    
    // Voeg regels weer samen
    protectedText = cleanLines.join(eol);

    // STAP 4: Operators en Spaties compacten
    const operators = [":=", "<=", ">=", "<>", "+", "-", "*", "/", "=", "<", ">", ",", ";", ":"];
    
    const opPattern = operators
        .sort((a, b) => b.length - a.length)
        .map(op => op.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
        .join('|');

    // [ \t]* zorgt dat enters (breaks in de code flow) behouden blijven
    const opRegex = new RegExp(`[ \\t]*(${opPattern})[ \\t]*`, 'g');
    protectedText = protectedText.replace(opRegex, '$1');

    // Normaliseer overgebleven horizontale witruimte
    protectedText = protectedText.replace(/[ \t]+/g, ' ');

    // STAP 5: Herstellen
    protectedText = protectedText.replace(/___TOKEN_(\d+)___/g, (match, index) => {
        return placeholders[parseInt(index)];
    });

    return protectedText;
}

module.exports = compactCode;