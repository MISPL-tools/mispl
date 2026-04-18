const vscode = require("vscode");

function alignAssignments(text) {
    // 1. Bepaal tabWidth op basis van actieve editor of user settings
    let tabWidth = 3; // fallback

    const editor = vscode.window.activeTextEditor;
    if (editor && typeof editor.options.tabSize === "number") {
        tabWidth = editor.options.tabSize;
    } else {
        const cfg = vscode.workspace.getConfiguration("editor");
        tabWidth = cfg.get("tabSize", 3);
    }

    const lines = text.split(/\r?\n/);

    // 2. Verzamel info per regel
    const infos = lines.map(line => {
        const idx = line.indexOf(":=");
        if (idx === -1) {
            return { line, hasAssign: false };
        }

        const beforeRaw = line.substring(0, idx);
        const before = beforeRaw.replace(/\s+$/g, "");

        // visuele lengte berekenen
        let visualLen = 0;
        for (const ch of before) {
            visualLen += (ch === "\t") ? tabWidth : 1;
        }

        const after = line.substring(idx + 2);

        return {
            line,
            hasAssign: true,
            before,
            after,
            visualLen
        };
    });

    // 3. Max visuele lengte vóór :=
    const maxLen = infos.reduce(
        (m, info) => info.hasAssign ? Math.max(m, info.visualLen) : m,
        0
    );

    // 4. Doelkolom = eerstvolgende tabstop
    const targetCol = Math.ceil((maxLen + 1) / tabWidth) * tabWidth;

    // 5. Nieuwe regels bouwen
    const out = infos.map(info => {
        if (!info.hasAssign) return info.line;

        const diff = targetCol - info.visualLen;
        const tabsNeeded = diff > 0 ? Math.ceil(diff / tabWidth) : 1;

        return info.before + "\t".repeat(tabsNeeded) + ":=" + info.after;
    });

    return out.join("\n");
}

module.exports = alignAssignments;
