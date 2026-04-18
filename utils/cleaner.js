function stripCommentsAndStrings(code) {
    let out = "";
    let inComment = false;
    let inString = false;

    for (let i = 0; i < code.length; i++) {
        const c = code[i];
        const next = code[i + 1];

        // STRING START
        if (!inComment && c === '"' && !inString) {
            inString = true;
            out += '"';
            continue;
        }

        // STRING END
        if (inString) {
            if (c === '"') inString = false;
            out += " "; // vervang inhoud door spatie
            continue;
        }

        // COMMENT START
        if (!inComment && c === "/" && next === "*") {
            inComment = true;
            out += "  "; // vervang "/*"
            i++;
            continue;
        }

        // COMMENT END
        if (inComment) {
            if (c === "*" && next === "/") {
                inComment = false;
                out += "  "; // vervang "*/"
                i++;
                continue;
            }
            out += " "; // vervang commentaarinhoud
            continue;
        }

        // NORMALE KARAKTER
        out += c;
    }

    return out;
}

module.exports = { stripCommentsAndStrings };
