// mermaid/misplToMermaid.js
// Volledig herschreven MISPL → Mermaid parser
// Ondersteunt: IF / ELSE / inline IF / WHILE / REPEAT / RETURN / statements
// Inline IF's (IF ... THEN ... ENDIF op één regel) krijgen géén eigen blok,
// maar worden als één decision-node binnen de outer IF behandeld.

const safeLabel = require("../utils/safeLabel");

function misplToMermaid(code) {
    const lines = code.split(/\r?\n/);

    let nodes = [];
    let edges = [];
    let styles = [];
    let nodeMeta = {};

    let idCounter = 0;
    let lastId = null;

    function newId() {
        return "N" + (idCounter++);
    }

    // Donkere kleuren, goed leesbaar
    const COLORS = {
        IF:     { fill: "#4b1f35", stroke: "#ff9ac4" },
        WHILE:  { fill: "#1f3b28", stroke: "#8ad6a2" },
        REPEAT: { fill: "#1f3045", stroke: "#8fbfff" }
    };

    function addStyle(id, color) {
        if (!color) return;
        styles.push(
            `style ${id} fill:${color.fill},stroke:${color.stroke},stroke-width:2px`
        );
    }

    /**
     * Node toevoegen.
     * Binnen een IF‑blok:
     *   - statements worden als parallelle takken aan de IF‑conditie gehangen
     * Buiten een IF‑blok:
     *   - lineaire flow via lastId
     */
    function addNode(label, opts = {}) {
        const {
            shape = "rect",
            color = null,
            detached = false,
            lineNumber = null,
            kind = "normal"
        } = opts;

        const id = newId();
        const text = safeLabel(label);

        let def;
        if (shape === "decision") {
            def = `${id}{"${text}"}`;
        } else if (shape === "terminator") {
            def = `${id}(("${text}"))`;
        } else {
            def = `${id}["${text}"]`;
        }

        nodes.push(def);
        addStyle(id, color);

        nodeMeta[id] = { label, line: lineNumber, kind };

        const top = stack[stack.length - 1];

        if (top && top.type === "IF" && kind !== "if-join") {
            // Binnen IF‑blok → parallelle tak vanaf de IF‑conditie
            const list = top.inElse ? top.elseNodes : top.thenNodes;
            list.push(id);

            edges.push(`${top.id} --> ${id}`);
            // lastId bewust NIET bijwerken → geen lineaire chaining binnen IF
        } else {
            // Normale lineaire flow
            if (!detached && lastId) {
                edges.push(`${lastId} --> ${id}`);
            }
            lastId = id;
        }

        return id;
    }

    // Helpers
    function isComment(line) {
        return line.startsWith("/*") && line.endsWith("*/");
    }
    function isDeclaration(line) {
        return /^(STRING|INTEGER|REAL|BOOL|VAR|CONST)\b/i.test(line);
    }
    function isCodeStart(line) {
        const u = line.toUpperCase();
        if (u.startsWith("IF ")) return true;
        if (u.startsWith("WHILE ")) return true;
        if (u.startsWith("REPEAT")) return true;
        if (u.startsWith("RETURN")) return true;
        if (line.includes(":=")) return true;
        return false;
    }
    function normalizeReturn(line) {
        if (/^RETURN\b/i.test(line) && !/^RETURN\s+/i.test(line)) {
            return "RETURN " + line.substring(6).trim();
        }
        return line;
    }

    // Detect inline IF: IF ... THEN ... ENDIF; op één regel
    function isInlineIf(line) {
        const u = line.toUpperCase();
        return u.startsWith("IF ") && u.includes(" THEN") && u.includes("ENDIF");
    }

    // Parser state
    let stack = [];
    let codeStarted = false;

    // Start node
    const startId = addNode("Start", {
        shape: "terminator",
        detached: true,
        lineNumber: 0,
        kind: "start"
    });
    lastId = startId;

    //
    // HOOFDLOOP
    //
    for (let i = 0; i < lines.length; i++) {
        let raw = lines[i];
        let line = raw.trim();
        if (!line) continue;

        // HEADER overslaan
        if (!codeStarted) {
            if (isComment(line)) continue;
            if (isDeclaration(line)) continue;
            if (!isCodeStart(line)) continue;
            codeStarted = true;
        }

        line = normalizeReturn(line);
        const upper = line.toUpperCase();

        // Comments in code negeren
        if (isComment(line)) continue;

        //
        // INLINE IF (op één regel)
        //
        if (isInlineIf(line)) {
            // We nemen de volledige regel als label
            addNode(line, {
                shape: "decision",
                color: COLORS.IF,
                lineNumber: i,
                kind: "if-inline"
            });
            continue;
        }

        //
        // IF‑BEGIN (blok)
        //
        if (upper.startsWith("IF ") && upper.includes(" THEN")) {
            const cond = line.replace(/^IF\s*/i, "").replace(/\s*THEN;?$/i, "");

            const id = addNode(cond, {
                shape: "decision",
                color: COLORS.IF,
                lineNumber: i,
                kind: "if"
            });

            stack.push({
                type: "IF",
                id,
                thenNodes: [],
                elseNodes: [],
                inElse: false
            });

            lastId = id;
            continue;
        }

        //
        // ELSE
        //
        if (upper === "ELSE" || upper === "ELSE;") {
            const top = stack[stack.length - 1];
            if (top && top.type === "IF") {
                top.inElse = true;
            }
            continue;
        }

        //
        // ENDIF
        //
        if (upper === "ENDIF" || upper === "ENDIF;") {
            const top = stack.pop();

            const joinId = addNode("END IF", {
                lineNumber: i,
                kind: "if-join"
            });

            if (top && top.type === "IF") {
                // THEN‑takken → join
                for (const n of top.thenNodes) {
                    edges.push(`${n} --> ${joinId}`);
                }
                // ELSE‑takken → join
                for (const n of top.elseNodes) {
                    edges.push(`${n} --> ${joinId}`);
                }
            }

            lastId = joinId;
            continue;
        }

        //
        // WHILE
        //
        if (upper.startsWith("WHILE ") && upper.includes(" DO")) {
            const cond = line.replace(/^WHILE\s*/i, "").replace(/\s*DO;?$/i, "");

            const id = addNode(cond, {
                shape: "decision",
                color: COLORS.WHILE,
                lineNumber: i,
                kind: "while"
            });

            stack.push({ type: "WHILE", id });
            lastId = id;
            continue;
        }

        //
        // DONE
        //
        if (upper === "DONE" || upper === "DONE;") {
            const top = stack.pop();
            if (top && top.type === "WHILE") {
                // lichaam → conditie
                edges.push(`${lastId} --> ${top.id}`);

                const exitId = addNode("END WHILE", {
                    lineNumber: i,
                    kind: "while-join"
                });

                edges.push(`${top.id} --> ${exitId}`);
                lastId = exitId;
            }
            continue;
        }

        //
        // REPEAT
        //
        if (upper === "REPEAT" || upper === "REPEAT;") {
            const id = addNode("REPEAT", {
                color: COLORS.REPEAT,
                lineNumber: i,
                kind: "repeat"
            });
            stack.push({ type: "REPEAT", id });
            lastId = id;
            continue;
        }

        //
        // UNTIL
        //
        if (upper.startsWith("UNTIL ")) {
            const cond = line.replace(/^UNTIL\s*/i, "").replace(/;$/i, "");
            const top = stack.pop();

            const condId = addNode(cond, {
                shape: "decision",
                color: COLORS.REPEAT,
                lineNumber: i,
                kind: "repeat-cond"
            });

            edges.push(`${lastId} --> ${condId}`);

            if (top && top.type === "REPEAT") {
                edges.push(`${condId} --> ${top.id}`);
            }

            const exitId = addNode("END REPEAT", {
                lineNumber: i,
                kind: "repeat-join"
            });

            edges.push(`${condId} --> ${exitId}`);
            lastId = exitId;
            continue;
        }

        //
        // RETURN
        //
        if (upper.startsWith("RETURN")) {
            addNode(line, {
                lineNumber: i,
                kind: "return"
            });
            continue;
        }

        //
        // NORMAAL STATEMENT
        //
        addNode(line, {
            lineNumber: i,
            kind: "normal"
        });
    }

    // End node
    addNode("End", {
        shape: "terminator",
        lineNumber: lines.length - 1,
        kind: "end"
    });

    const mermaid = [
        "flowchart TD",
        "    " + nodes.join("\n    "),
        "",
        "    " + edges.join("\n    "),
        styles.length ? "\n    " + styles.join("\n    ") : ""
    ].join("\n");

    return { mermaid, nodeMeta };
}

module.exports = misplToMermaid;
