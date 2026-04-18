// ./features/validationFlow.js

function extractOrGenerateMisplName(text) {
    const commentMatch = text.match(/^\s*\/\*\s*(.*?)\s*\*\//);
    if (commentMatch && commentMatch[1]) {
        let cleanName = commentMatch[1].trim().replace(/[^a-zA-Z0-9_]/g, '_');
        if (cleanName.length > 0) return cleanName;
    }

    const now = new Date();
    const dd = String(now.getDate()).padStart(2, '0');
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const yyyy = now.getFullYear();

    return `ValidateMISPL_${dd}${mm}${yyyy}`;
}

// 100% Veilige tellende Scanner voor Genest Commentaar en Strings (ZONDER backslash-escapes!)
function extractStringsAndComments(text) {
    const protectedItems = [];
    let cleaned = "";
    let i = 0;
    let itemIndex = 0;

    while (i < text.length) {
        if (text[i] === '"') {
            let start = i;
            i++;
            while (i < text.length) {
                if (text[i] === '"') { i++; break; } 
                else { i++; }
            }
            const key = `__PROTECTED_${itemIndex++}__`;
            protectedItems.push({ key, val: text.substring(start, i) });
            cleaned += key;
        }
        else if (text[i] === '/' && text[i+1] === '/') {
            let start = i;
            while (i < text.length && text[i] !== '\n' && text[i] !== '\r') { i++; }
            const key = `__PROTECTED_${itemIndex++}__`;
            protectedItems.push({ key, val: text.substring(start, i) });
            cleaned += key;
        }
        else if (text[i] === '/' && text[i+1] === '*') {
            let start = i;
            let depth = 1; 
            i += 2;
            while (i < text.length && depth > 0) {
                if (text[i] === '/' && text[i+1] === '*') { depth++; i += 2; } 
                else if (text[i] === '*' && text[i+1] === '/') { depth--; i += 2; } 
                else { i++; }
            }
            const key = `__PROTECTED_${itemIndex++}__`;
            protectedItems.push({ key, val: text.substring(start, i) });
            cleaned += key;
        }
        else {
            cleaned += text[i];
            i++;
        }
    }
    return { cleaned, protectedItems };
}

function restoreStringsAndComments(text, protectedItems) {
    let res = text;
    for (const item of protectedItems) {
        res = res.replace(item.key, () => item.val);
    }
    return res;
}

// DE FIX: logId = "1" toegevoegd aan de functie definitie!
function injectValidationFlow(text, logId = "1") {
    if (!text || text.trim() === "") return text;

    const misplName = extractOrGenerateMisplName(text);
    const { cleaned, protectedItems } = extractStringsAndComments(text);
    
    let workText = cleaned;
    let varCounter = 0;
    const marker = "/*@V*/";

    // 1. Global replace voor keywords
    workText = workText.replace(/\bTHEN\b/gi, () => {
        let id = "T" + varCounter++;
        return `THEN${marker}_sV:=_sV+"${id}|";`;
    });
    
    workText = workText.replace(/\bDO\b/gi, () => {
        let id = "D" + varCounter++;
        return `DO${marker}_sV:=_sV+"${id}|";`;
    });
    
    workText = workText.replace(/\bELSE\b/gi, () => {
        let id = "E" + varCounter++;
        return `ELSE${marker}_sV:=_sV+"${id}|";`;
    });
    
    workText = workText.replace(/\bREPEAT\b/gi, () => {
        let id = "R" + varCounter++;
        return `REPEAT${marker}_sV:=_sV+"${id}|";`;
    });

    workText = workText.replace(/\bRETURN\b/gi, () => {
        // DE FIX: Hier wordt logId nu zonder errors geaccepteerd
        let glimsLogCode = `AddLogEntry("gp_SiteFunction",${logId},"Validate_Flow",1,TRUE,"${misplName}:"+_sV);`; 
        return `${marker}${glimsLogCode}RETURN`;
    });

    // 2. Zoek de perfecte positie voor de declaratie
    let lines = workText.split(/\r?\n/);
    let insertLine = 0;
    
    // We negeren alle header-comments (__PROTECTED_x__) en lege regels, 
    // totdat we de eerste regel met échte code bereiken.
    for (let i = 0; i < lines.length; i++) {
        let stripped = lines[i].replace(/__PROTECTED_\d+__/g, "").trim();
        if (stripped.length > 0) {
            insertLine = i;
            break;
        }
    }

    // Bewaar eventuele inspringing van de eerste coderegel en injecteer daar de marker
    let match = lines[insertLine].match(/^([ \t]*)/);
    let indent = match ? match[1] : "";
    lines.splice(insertLine, 0, indent + `${marker}String _sV;`);
    
    let resultText = lines.join("\n");
    
    // 3. Zet strings en commentaren weer ongeschonden terug
    return restoreStringsAndComments(resultText, protectedItems);
}

function removeValidationFlow(text) {
    // We vervangen door " " (een spatie) in plaats van "". 
    // Dit voorkomt het "THENRETURN" en "ELSERETURN" probleem in geminificeerde code!
    return text.replace(/[ \t]*\/\*@V\*\/[^;]*;[ \t]*\r?\n?/g, " ");
}

module.exports = {
    injectValidationFlow,
    removeValidationFlow
};