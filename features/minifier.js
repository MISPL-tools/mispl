// features/minifier.js

function minifyMISPL(code) {
    // 1. Maskeer strings zodat we veilig Regex kunnen gebruiken
    const strings = [];
    let masked = code.replace(/"(?:[^"]|"")*"/g, match => {
        strings.push(match);
        return `__STR${strings.length - 1}__`;
    }).replace(/'(?:[^']|'')*'/g, match => {
        strings.push(match);
        return `__STR${strings.length - 1}__`;
    });

    // 2. Verwijder Debug variabelen volautomatisch
    const debugKeywords = ["debug", "trace", "kruimel", "testlog"];
    let debugVarsFound = [];
    const words = masked.match(/\b[a-zA-Z_][a-zA-Z0-9_]*\b/g) || [];
    for (const w of words) {
        const lower = w.toLowerCase();
        if (debugKeywords.some(dk => lower.includes(dk))) {
            if (!debugVarsFound.includes(w)) debugVarsFound.push(w);
        }
    }

    for (const dVar of debugVarsFound) {
        const assignRegex = new RegExp(`\\b${dVar}\\b\\s*:=[^;]*;`, 'g');
        masked = masked.replace(assignRegex, '');

        const funcRegex = new RegExp(`\\b[a-zA-Z0-9_\\.]+\\s*\\(\\s*[^;]*?\\b${dVar}\\b[^;]*?\\)\\s*;`, 'g');
        masked = masked.replace(funcRegex, '');

        const declRegex = new RegExp(`\\b${dVar}\\b\\s*`, 'g'); 
        masked = masked.replace(declRegex, '');
    }

    // 3. Opschonen van declaratie-restanten
    masked = masked.replace(/,\s*,+/g, ','); 
    const types = "String|Integer|Logical|Fractional|Date|Time|DateTime|Object|Order|Result|Specimen|Correspondent";
    const leadingCommaRegex = new RegExp(`\\b(${types})\\s*,+`, 'ig');
    masked = masked.replace(leadingCommaRegex, '$1 '); 
    masked = masked.replace(/,\s*;/g, ';'); 
    const emptyDeclRegex = new RegExp(`(^|;)\\s*(${types})\\s*;`, 'ig');
    masked = masked.replace(emptyDeclRegex, '$1'); 

    // 4. Lege blokken opruimen
    for(let j=0; j<5; j++) {
        masked = masked.replace(/\bELSE\s+ENDIF\s*;/gi, 'ENDIF;');
        masked = masked.replace(/\bIF\b[^;]*?\bTHEN\s+ENDIF\s*;/gi, '');
        masked = masked.replace(/\bWHILE\b[^;]*?\bDO\s+DONE\s*;/gi, '');
        masked = masked.replace(/\bREPEAT\s+UNTIL\b[^;]*?;/gi, '');
    }

    // 5. Depth-Aware Comment Remover (NU MET ANTI-PLAK BEVEILIGING!)
    let noComments = "";
    let commentDepth = 0;
    let i = 0;

    while (i < masked.length) {
        const c = masked[i];
        const next = masked[i + 1] || '';

        if (commentDepth === 0) {
            if (c === '/' && next === '*') {
                commentDepth++;
                i += 2;
                noComments += ' '; // 🚀 FIX: Laat een spatie achter als we een commentaar ingaan
            } else {
                noComments += c;
                i++;
            }
        } else {
            if (c === '/' && next === '*') {
                commentDepth++;
                i += 2;
            } else if (c === '*' && next === '/') {
                commentDepth--;
                i += 2;
                if (commentDepth === 0) {
                    noComments += ' '; // 🚀 FIX: Laat een spatie achter als we er weer uitkomen!
                }
            } else {
                i++;
            }
        }
    }

    // 6. VEILIGE Witruimte compressie (GLIMS-Proof)
    noComments = noComments.replace(/\s+/g, ' ');        
    noComments = noComments.replace(/\s*;\s*/g, ';\r\n');   
    noComments = noComments.replace(/\s*,\s*/g, ',');     
    noComments = noComments.replace(/\s*:=\s*/g, ':=');   
    noComments = noComments.replace(/\s*\(\s*/g, '(');   
    noComments = noComments.replace(/\s*\)\s*/g, ')');   
    noComments = noComments.replace(/\s*\+\s*/g, '+');
    noComments = noComments.replace(/\s*-\s*/g, '-');
    noComments = noComments.replace(/\s*=\s*/g, '=');
    noComments = noComments.replace(/\s*<>\s*/g, '<>');
    noComments = noComments.replace(/\s*>\s*/g, '>');
    noComments = noComments.replace(/\s*<\s*/g, '<');

    // 7. Originele Strings weer ongeschonden terugplaatsen
    let finalCode = noComments.replace(/__STR(\d+)__/g, (match, p1) => {
        return strings[parseInt(p1, 10)];
    });

    // 8. HET STOOTKUSSEN
    return "/* MINIFIED */\r\n" + finalCode.trim();
}

module.exports = minifyMISPL;