// astPrinter.js

function printAst(ast) {
    if (!ast) return "Geen AST gevonden.";
    // We beginnen bij Program met een compleet lege prefix
    return render(ast, "", true).join("\n");
}

// astPrinter.js

// astPrinter.js

function getChildren(node) {
    if (!node || typeof node !== "object") return [];
    let children = [];

    // 1. Program / While body
    if (node.body && Array.isArray(node.body)) {
        const declarations = node.body.filter(n => n.type === 'Declaration');
        const otherStatements = node.body.filter(n => n.type !== 'Declaration');

        if (declarations.length > 0) {
            children.push({ node: { type: 'Declarations', count: declarations.length }, kind: "" });
        }
        otherStatements.forEach(child => children.push({ node: child, kind: "" }));
    }
    
    // 2. De IF-logica met extra check
    if (node.type === 'IfStatement') {
        if (node.thenBlock) {
            const tb = Array.isArray(node.thenBlock) ? node.thenBlock : [node.thenBlock];
            tb.forEach(child => children.push({ node: child, kind: "then" }));
        }
        
        // Als dit niet afgaat, dan herkent de printer het veld 'elseBlock' niet
        if (node.elseBlock) {
            const eb = Array.isArray(node.elseBlock) ? node.elseBlock : [node.elseBlock];
            eb.forEach(child => children.push({ node: child, kind: "else" }));
        } else {
            // DEBUG: check of er misschien een ander veld is dat op 'else' lijkt
            Object.keys(node).forEach(key => {
                if (key.toLowerCase().includes('else')) {
                    const eb = Array.isArray(node[key]) ? node[key] : [node[key]];
                    eb.forEach(child => children.push({ node: child, kind: key }));
                }
            });
        }
    }

    return children;
}

// astPrinter.js

function nodeLabel(node, kind) {
    // 1. Speciale case voor onze samengevatte node
    if (node.type === 'Declarations') {
        return `Declarations (${node.count} variables)`;
    }

    // 2. Bepaal het voorvoegsel ([THEN] of [ELSE])
    const prefix = kind ? `[${kind.toUpperCase()}] ` : "";

    // 3. Bouw de rest van het label
    const type = node.type || "Node";
    const detail = node.condition || node.name || node.variable || node.value || "";
    const label = detail ? `${type}(${detail})` : type;

    return prefix + label;
}

function render(node, prefix, isLast, kind = "") {
    // We geven nu 'kind' door aan nodeLabel in plaats van de node te muteren
    const label = nodeLabel(node, kind);
    
    const isRoot = prefix === "";
    const marker = isRoot ? "" : (isLast ? "└── " : "├── ");
    
    let lines = [prefix + marker + label];

    let nextPrefix = prefix;
    if (!isRoot) {
        nextPrefix += isLast ? "    " : "│   ";
    }

    const children = getChildren(node);
    children.forEach((child, index) => {
        const isLastChild = index === children.length - 1;
        
        // We geven de root-inspringing door
        const effectivePrefix = isRoot ? "    " : nextPrefix;
        
        // Geef het 'kind' (then/else) door naar de volgende render-stap
        lines = lines.concat(render(child.node, effectivePrefix, isLastChild, child.kind));
    });

    return lines;
}

module.exports = { printAst };