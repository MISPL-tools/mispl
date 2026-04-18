// mermaid/webview.js
const vscode = require("vscode");

function getWebviewContent(webview, extensionUri, mermaidData, nodeMeta) {
    const nonce = getNonce();

    // Zorg dat mermaidCode altijd een string is
    const mermaidCode =
        mermaidData &&
        typeof mermaidData.mermaid === "string"
            ? mermaidData.mermaid
            : "flowchart TD\nA[No data]";

    const mermaidScriptUri = webview.asWebviewUri(
        vscode.Uri.joinPath(extensionUri, "media", "mermaid.min.js")
    );

    // LET OP: return moet direct vóór de template staan (geen newline ertussen)
    return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8" />

    <meta http-equiv="Content-Security-Policy" content="
        default-src 'none';
        img-src ${webview.cspSource} https:;
        style-src ${webview.cspSource} 'unsafe-inline';
        script-src 'nonce-${nonce}' ${webview.cspSource};
        font-src ${webview.cspSource};
        connect-src ${webview.cspSource};
    " />

    <style>
        body {
            font-family: system-ui, sans-serif;
            margin: 0;
            padding: 8px;
            background: #1e1e1e;
            color: #eee;
            overflow: hidden;
        }
        #toolbar {
            display: flex;
            align-items: center;
            gap: 8px;
            margin-bottom: 8px;
            font-size: 12px;
        }
        #diagram-outer {
            position: relative;
            width: 100%;
            height: calc(100vh - 40px);
            background: #252526;
            border-radius: 4px;
            overflow: hidden;
            border: 1px solid #333;
        }
        #diagram-inner {
            transform-origin: 0 0;
            cursor: grab;
        }
        #diagram-inner.dragging {
            cursor: grabbing;
        }

        .node-selected > rect,
        .node-selected > polygon,
        .node-selected > path {
            stroke: #ffff00 !important;
            stroke-width: 3px !important;
        }
        .node-return > rect,
        .node-return > polygon,
        .node-return > path {
            stroke: #00ffff !important;
            stroke-width: 3px !important;
        }
        .node-branch > rect,
        .node-branch > polygon,
        .node-branch > path {
            stroke: #ffa500 !important;
            stroke-width: 3px !important;
        }
        .node-loop > rect,
        .node-loop > polygon,
        .node-loop > path {
            stroke: #00ffaa !important;
            stroke-width: 3px !important;
        }

        /* Zorg dat SVG interacties werken in VS Code Webview */
        svg, svg * {
            pointer-events: all !important;
        }
    </style>
</head>
<body>
    <div id="toolbar">
        <span>Zoom: <span id="zoomLabel">100%</span></span>
        <button id="resetView">Reset view</button>
    </div>

    <!-- Toggle knop + codeblok -->
    <div id="codeToggleContainer" style="margin-bottom:8px;">
        <button id="toggleCode"
            style="padding:4px 8px; font-size:12px; cursor:pointer;">
            Toon Mermaid code
        </button>

        <pre id="mermaidCodeBlock" style="
            display:none;
            white-space:pre;
            background:#111;
            color:#eee;
            padding:10px;
            border:1px solid #444;
            margin-top:8px;
            max-height:200px;
            overflow:auto;
        "></pre>
    </div>

    <div id="diagram-outer">
        <div id="diagram-inner">
            <div id="diagram">Rendering…</div>
        </div>
    </div>

    <!-- Mermaid library laden -->
    <script nonce="${nonce}" src="${mermaidScriptUri}"></script>

 <!-- Hoofdscript: render, interacties, zoom/pan, toggle -->
<script nonce="${nonce}">
    (function () {
        console.log("[MISPL MERMAID] inline script start");

        const vscode = acquireVsCodeApi();
        const diagramOuter = document.getElementById('diagram-outer');
        const diagramInner = document.getElementById('diagram-inner');
        const diagramEl   = document.getElementById('diagram');
        const zoomLabel   = document.getElementById('zoomLabel');
        const resetButton = document.getElementById('resetView');

        const toggleBtn   = document.getElementById('toggleCode');
        const codeBlock   = document.getElementById('mermaidCodeBlock');

        let code = \`${mermaidCode.replace(/`/g, "\\`")}\`;
        let meta = ${JSON.stringify(nodeMeta || {})};

        window.addEventListener("message", (event) => {
            const msg = event.data;
            console.log("[MISPL MERMAID] message received in webview:", msg);

            if (msg.type === "updateDiagram") {
                const newCode = msg.mermaid;
                const newMeta = msg.meta;

                console.log("[MISPL MERMAID] updateDiagram called");
                console.log("[MISPL MERMAID] newCode:", newCode);
                console.log("[MISPL MERMAID] newMeta:", newMeta);

                // Update interne variabelen
                code = newCode;
                meta = newMeta;

                // Render opnieuw
                try {
                    mermaid.render("misplDiagram", newCode, (svg) => {
                        console.log("[MISPL MERMAID] mermaid.render (update) callback");
                        diagramEl.innerHTML = svg;

                        // Zoom/pan opnieuw activeren
                        setupZoomPan();

                        // Interacties opnieuw koppelen
                        wireInteractionsDelegated();
                    });
                } catch (err) {
                    console.error("[MISPL MERMAID] ERROR IN mermaid.render (update):", err);
                    diagramEl.innerHTML =
                        "<pre style='color:red'>Render error (update): "
                        + String(err) +
                        "</pre>";
                }
            }
        });

            function log(msg, extra) {
                if (extra !== undefined) {
                    console.log('[MISPL MERMAID]', msg, extra);
                } else {
                    console.log('[MISPL MERMAID]', msg);
                }
            }

            // Toggle-knop voor Mermaid-code
            if (toggleBtn && codeBlock) {
                toggleBtn.addEventListener('click', () => {
                    const hidden = codeBlock.style.display === 'none';
                    codeBlock.style.display = hidden ? 'block' : 'none';
                    codeBlock.textContent = code;
                    toggleBtn.textContent = hidden
                        ? 'Verberg Mermaid code'
                        : 'Toon Mermaid code';
                });
            } else {
                log('Toggle elements not found');
            }

            if (typeof mermaid === 'undefined') {
                diagramEl.textContent = 'Mermaid kon niet geladen worden.';
                log('mermaid is undefined');
                return;
            }

            mermaid.initialize({
                startOnLoad: false,
                securityLevel: "loose",
                theme: "dark",
                flowchart: { useMaxWidth: false }
            });

            function clearNodeClasses() {
                const all = diagramInner.querySelectorAll(
                    'g.node-selected, g.node-return, g.node-branch, g.node-loop'
                );
                all.forEach(g => {
                    g.classList.remove('node-selected', 'node-return', 'node-branch', 'node-loop');
                });
            }

            function applyKindClass(g, kind) {
                if (!g) return;
                if (kind === 'return') {
                    g.classList.add('node-return');
                } else if (kind === 'if' || kind === 'if-join') {
                    g.classList.add('node-branch');
                } else if (kind && (kind.startsWith('while') || kind.startsWith('repeat'))) {
                    g.classList.add('node-loop');
                }
            }

            function wireInteractionsDelegated() {
                log("wireInteractionsDelegated() called");

                const svg = diagramEl.querySelector("svg");
                if (!svg) {
                    log("NO SVG FOUND FOR INTERACTIONS");
                    return;
                }

                function findLabelAndMeta(target) {
                    const g = target.closest("g");
                    if (!g) return null;

                    const textEl =
                        g.querySelector("text") ||
                        g.querySelector("tspan") ||
                        g.querySelector("title") ||
                        g.querySelector("foreignObject");

                    let label = "";
                    if (textEl) {
                        label = (textEl.textContent || "").trim();
                    }
                    if (!label) return null;

                    const id = Object.keys(meta).find(k => meta[k].label === label);
                    if (!id) return null;

                    return { g, info: meta[id], label };
                }

                svg.addEventListener("click", (e) => {
                    const found = findLabelAndMeta(e.target);
                    if (!found) return;

                    const { g, info } = found;
                    clearNodeClasses();
                    g.classList.add("node-selected");
                    applyKindClass(g, info.kind);

                    vscode.postMessage({
                        type: "nodeClicked",
                        meta: info
                    });
                });

                svg.addEventListener("dblclick", (e) => {
                    const found = findLabelAndMeta(e.target);
                    if (!found) return;

                    const { info } = found;
                    vscode.postMessage({
                        type: "openDetail",
                        meta: info
                    });
                });

                // Hover
                svg.addEventListener("mousemove", (e) => {
                    const found = findLabelAndMeta(e.target);
                    if (!found) return;

                    const { info } = found;

                    vscode.postMessage({
                        type: "hoverNode",
                        meta: info
                    });
                });

                log("Delegated handlers attached to SVG");
            }

            function setupZoomPan() {
                let zoom = 1.0;
                let offsetX = 0;
                let offsetY = 0;
                let dragging = false;
                let lastX = 0;
                let lastY = 0;

                function updateTransform() {
                    diagramInner.style.transform =
                        'translate(' + offsetX + 'px,' + offsetY + 'px) scale(' + zoom + ')';
                    zoomLabel.textContent = Math.round(zoom * 100) + '%';
                }

                diagramOuter.addEventListener('wheel', (e) => {
                    e.preventDefault();
                    const delta = e.deltaY > 0 ? -0.1 : 0.1;
                    zoom = Math.min(3, Math.max(0.2, zoom + delta));
                    updateTransform();
                });

                diagramOuter.addEventListener('mousedown', (e) => {
                    if (e.button !== 0) return;
                    dragging = true;
                    diagramInner.classList.add('dragging');
                    lastX = e.clientX;
                    lastY = e.clientY;
                });

                window.addEventListener('mousemove', (e) => {
                    if (!dragging) return;
                    const dx = e.clientX - lastX;
                    const dy = e.clientY - lastY;
                    offsetX += dx;
                    offsetY += dy;
                    lastX = e.clientX;
                    lastY = e.clientY;
                    updateTransform();
                });

                window.addEventListener('mouseup', () => {
                    dragging = false;
                    diagramInner.classList.remove('dragging');
                });

                resetButton.addEventListener('click', () => {
                    zoom = 1.0;
                    offsetX = 0;
                    offsetY = 0;
                    updateTransform();
                });

                updateTransform();
            }

            try {
                log("calling mermaid.render");
                mermaid.render("misplDiagram", code, (svg) => {
                    log('mermaid.render callback called');
                    diagramEl.innerHTML = svg;

                    // Optioneel: standaard Mermaid-onclicks verwijderen
                    diagramEl.querySelectorAll("g").forEach(g => {
                        g.onclick = null;
                        g.removeAttribute("onclick");
                    });

                    const svgEl = diagramEl.querySelector("svg");
                    log("svg present after render?", !!svgEl);

                    setupZoomPan();
                    wireInteractionsDelegated();
                });
            } catch (err) {
                console.error(err);
                diagramEl.innerHTML = "<pre style='color:red'>" + String(err) + "</pre>";
            }
        })();
    </script>
</body>
</html>`;
}

function getNonce() {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    let result = "";
    for (let i = 0; i < 32; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
}

module.exports = getWebviewContent;
