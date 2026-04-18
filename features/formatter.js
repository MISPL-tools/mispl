function formatMISPL(text) {
    // 0. DE OUTLOOK-FIX: Strip onzichtbare Non-Breaking Spaces (NBSP) eruit!
    let sanitizedText = text.replace(/\xA0/g, ' '); 

    // 1. Veilig extraheren van Strings én Commentaar in één gelijktijdige doorgang!
    const { cleaned, strings, comments } = extractStringsAndComments(sanitizedText);

    // 2. Inline IF-constructies beschermen
    const { protectedText, protectedLines } = protectInlineIf(cleaned);

    // 3. Normaliseren (regelstructuur)
    const normalized = normalizeLines(protectedText);

    // 4. Inline IF-regels terugzetten
    const withInlineRestored = restoreProtectedInline(normalized, protectedLines);

    // 5. Indent toepassen
    const indented = indentMISPL(withInlineRestored);

    // 6. Commentaar en Strings terugzetten
    const withComments = restoreComments(indented, comments);
    
    // 7. Overtollige witregels aan het einde verwijderen
    return restoreStrings(withComments, strings).trimEnd();
}

/* ----------------------------------------------------------
     FASE 1: STRINGS EN COMMENTAAR (TELLENDE SCANNER)
----------------------------------------------------------- */
function extractStringsAndComments(text) {
    const strings = [];
    const comments = [];
    let sIdx = 0;
    let cIdx = 0;
    let cleaned = "";
    let i = 0;

    while (i < text.length) {
        // Strings 
        if (text[i] === '"') {
            let start = i;
            i++;
            while (i < text.length) {
                if (text[i] === '"') { i++; break; }
                else { i++; }
            }
            const key = `__STR_${sIdx}__`;
            strings.push({ key, val: text.substring(start, i) });
            sIdx++;
            cleaned += key;
        }
        // Line comments
        else if (text.startsWith("//", i)) {
            let start = i;
            while (i < text.length && text[i] !== '\n' && text[i] !== '\r') { i++; }
            const key = `__COMMENT_LN_${cIdx}__`;
            comments.push({ key, val: text.substring(start, i) });
            cIdx++;
            cleaned += key;
        }
        // Block comments (Genest!)
        else if (text.startsWith("/*", i)) {
            let start = i;
            let depth = 1;
            i += 2;
            while (i < text.length && depth > 0) {
                if (text.startsWith("/*", i)) { depth++; i += 2; }
                else if (text.startsWith("*/", i)) { depth--; i += 2; }
                else { i++; }
            }
            const key = `__COMMENT_BLK_${cIdx}__`;
            comments.push({ key, val: text.substring(start, i) });
            cIdx++;
            cleaned += key;
        }
        // Code
        else {
            cleaned += text[i];
            i++;
        }
    }
    return { cleaned, strings, comments };
}

function restoreStrings(text, strings) {
    let res = text;
    for (const s of strings) {
        res = res.replace(s.key, s.val);
    }
    return res;
}

function restoreComments(text, comments) {
    let res = text;
    for (const c of comments) {
        res = res.replace(c.key, c.val);
    }
    return res;
}

/* ----------------------------------------------------------
     FASE 2: INLINE IF BESCHERMEN
----------------------------------------------------------- */
function protectInlineIf(text) {
    const protectedLines = [];
    let i = 0;

    const protectedText = text
        .split(/\r?\n/)
        .map(line => {
            const trimmed = line.trim();
            if (!trimmed) return ""; 
            
            const hasIf = /\bIF\b/i.test(trimmed);
            const hasThen = /\bTHEN\b/i.test(trimmed);
            const hasEndif = /\bENDIF\b/i.test(trimmed);
            const hasElse = /\bELSE\b/i.test(trimmed);
            const semiCount = (trimmed.match(/;/g) || []).length;

            const isInline = hasIf && hasThen && hasEndif && !hasElse && semiCount <= 2; 

            if (isInline) {
                const key = `__INLINE_${i}__`;
                protectedLines.push({ key, line: trimmed }); 
                i++;
                return key;
            }
            return line;
        })
        .join("\n");

    return { protectedText, protectedLines };
}

function restoreProtectedInline(text, protectedLines) {
    let res = text;
    for (const entry of protectedLines) {
        res = res.replace(entry.key, entry.line);
    }
    return res;
}

/* ----------------------------------------------------------
     FASE 3: NORMALIZER
----------------------------------------------------------- */
function normalizeLines(text) {
    let result = text;
    const inlineComments = "([ \t]*(?:__COMMENT_(?:BLK|LN)_\\d+__[ \t]*)*)";

    // 1. Bescherm bewuste lege regels
    result = result.replace(/(\r?\n[ \t]*){2,}/g, "\n__EMPTY_MARKER__\n");

    // 2. Puntkomma splitsen
    result = result.replace(new RegExp(";" + inlineComments + "\\s*", "g"), ";$1\n");

    // 3. Blok-openers
    result = result.replace(new RegExp("\\s*\\b(THEN|DO|REPEAT)\\b" + inlineComments + "\\s*", "gi"), " $1$2\n");

    // 4. Blok-midden
    result = result.replace(new RegExp("\\s*\\b(ELSE)\\b" + inlineComments + "\\s*", "gi"), "\n$1$2\n");

    // 5. Blok-sluiters
    result = result.replace(/\s*\b(ENDIF|DONE|UNTIL)\b/gi, "\n$1");

    // 6. Gereserveerde flow-keywords
    result = result.replace(/([^\n;{}])\s*\b(IF|WHILE|RETURN)\b/gi, "$1\n$2");

    // 7. Opschonen en splitsen
    let lines = result.split(/\r?\n/);
    let out = [];

    for (let raw of lines) {
        let line = raw.trim().replace(/\s{2,}/g, ' ');

        if (line === "__EMPTY_MARKER__") {
            out.push("");
            continue;
        }
        if (!line) continue;
        
        // DE FIX: Zorg dat placeholders (__COMMENT_BLK_x__) NIET worden aangezien voor afgebroken code!
        if (/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(line) && !line.startsWith("__") && !/^(IF|WHILE|REPEAT|ELSE|ENDIF|DONE|UNTIL|RETURN)$/i.test(line)) {
            out.push(line + " "); // Bewaar met spatie, wacht op de volgende regel
            continue;
        }

        // Als de vorige regel wacht op iets om aan vast te plakken
        if (out.length > 0 && out[out.length - 1].endsWith(" ") && !out[out.length - 1].includes(";")) {
            out[out.length - 1] += line;
        } else {
            out.push(line);
        }
    }

    // 8. Samenvoegen
    const finalLines = [];
    for (let i = 0; i < out.length; i++) {
        let cur = out[i];
        let next = out[i+1] || "";

        if (cur === "") {
            finalLines.push("");
            continue;
        }
        if (/^IF\b/i.test(cur) && /^THEN$/i.test(next)) {
            finalLines.push(cur + " " + next);
            i++; 
            continue;
        }
        if (/^WHILE\b/i.test(cur) && /^DO$/i.test(next)) {
            finalLines.push(cur + " " + next);
            i++;
            continue;
        }
        finalLines.push(cur);
    }

    return finalLines.join("\n");
}

/* ----------------------------------------------------------
     FASE 5: INDENTER
----------------------------------------------------------- */
function indentMISPL(text) {
    const lines = text.split(/\r?\n/);
    const out = [];
    let indent = 0;

    for (let raw of lines) {
        const trimmed = raw.trim(); 
        
        if (!trimmed) {
            out.push(""); 
            continue;
        }

        const lineForLogic = trimmed
            .replace(/__(?:COMMENT_BLK|COMMENT_LN|STR|INLINE)_\d+__/g, "")
            .trim()
            .toUpperCase();

        const openCount = (lineForLogic.match(/\b(IF|WHILE|REPEAT)\b/g) || []).length;
        const closeCount = (lineForLogic.match(/\b(ENDIF|DONE|UNTIL)\b/g) || []).length;
        const netChange = openCount - closeCount;

        let printIndent = indent;

        if (/^\s*(ENDIF|DONE|UNTIL|ELSE)\b/.test(lineForLogic)) {
            printIndent = Math.max(0, indent - 1);
        }

        out.push("\t".repeat(Math.max(0, printIndent)) + trimmed);

        indent = Math.max(0, indent + netChange);
    }

    return out.join("\n");
}

module.exports = formatMISPL;