// ./features/hoverProvider.js
const vscode = require('vscode');
const path = require('path');
const fs = require('fs');

let snippetsData = {};

// Laad het tekstbestand één keer in het geheugen als de extensie start
function loadSnippets(context) {
    if (Object.keys(snippetsData).length > 0) return; 
    
    try {
        const snippetsPath = path.join(context.extensionPath, 'snippets', 'mispl.code-snippets');
        
        if (fs.existsSync(snippetsPath)) {
            const rawText = fs.readFileSync(snippetsPath, 'utf8');
            
            // 🚀 POGING 1: Lees het in als een echt JSON object (Kogelvrij!)
            try {
                // Verwijder eventuele // comments en /* */ comments zodat JSON.parse niet crasht
                const cleanJson = rawText.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
                const parsed = JSON.parse(cleanJson);
                
                for (const key in parsed) {
                    const snip = parsed[key];
                    if (snip.prefix) {
                        let desc = "";
                        // Soms is description een array van regels, soms één lange string
                        if (Array.isArray(snip.description)) {
                            desc = snip.description.join('\n');
                        } else if (typeof snip.description === 'string') {
                            desc = snip.description;
                        }
                        snippetsData[key] = { prefix: snip.prefix, description: desc };
                    }
                }
                console.log(`✅ HoverProvider: ${Object.keys(snippetsData).length} snippets geladen via JSON.parse.`);
                return; // Gelukt! We hoeven niet verder.

            } catch (jsonErr) {
                console.warn("⚠️ JSON parse mislukt (misschien een typefoutje in de json?), we schakelen over op Regex fallback...");
            }

            // 🛠️ POGING 2: Reserve-wiel (Regex Fallback)
            // DE FIX: Hij stopt nu pas bij een } die aan het EIND van een regel staat (met een enter ervoor).
            // Hierdoor stopt hij niet per ongeluk bij ${1:sSource}
            const blockRegex = /"([^"]+)":\s*\{([\s\S]*?)\n[ \t]*\}/g;
            let match;
            
            while ((match = blockRegex.exec(rawText)) !== null) {
                const key = match[1];
                const blockContent = match[2];
                
                let prefix = "";
                const prefixMatch = blockContent.match(/"prefix":\s*"([^"]+)"/);
                if (prefixMatch) prefix = prefixMatch[1];
                
                let description = "";
                const descStrMatch = blockContent.match(/"description":\s*"((?:\\.|[^"\\])*)"/);
                if (descStrMatch) {
                    description = descStrMatch[1];
                }
                
                if (prefix) {
                    snippetsData[key] = {
                        prefix: prefix,
                        description: description
                    };
                }
            }
            console.log(`✅ HoverProvider: ${Object.keys(snippetsData).length} snippets geladen via Regex fallback.`);
        } else {
            console.warn("⚠️ Snippets bestand niet gevonden op pad: " + snippetsPath);
        }
    } catch (err) {
        console.error("❌ Kon snippets niet laden voor HoverProvider:", err);
    }
}

class MisplHoverProvider {
    provideHover(document, position, token) {
        if (Object.keys(snippetsData).length === 0) return null;

        const wordRange = document.getWordRangeAtPosition(position, /[\w.]+/);
        if (!wordRange) return null;

        const word = document.getText(wordRange);
        const lowerWord = word.toLowerCase();
        
        const fallbackWord = word.includes('.') ? word.split('.').pop().toLowerCase() : null;

        let snippetMatch = null;

        for (const key in snippetsData) {
            const snip = snippetsData[key];
            const lowerKey = key.toLowerCase();
            const lowerPrefix = snip.prefix.toLowerCase();

            if (lowerKey === lowerWord || lowerPrefix === lowerWord) {
                snippetMatch = snip;
                break; 
            }
            if (fallbackWord && (lowerKey === fallbackWord || lowerPrefix === fallbackWord)) {
                snippetMatch = snip;
            }
        }

        if (snippetMatch) {
            const hoverMd = new vscode.MarkdownString();
            hoverMd.isTrusted = true;
            
            hoverMd.appendCodeblock(snippetMatch.prefix, "mispl");
            
            if (snippetMatch.description && snippetMatch.description.trim() !== "") {
                // Vervang stiekeme string enters (\\n) door échte enters
                const cleanDescription = snippetMatch.description.replace(/\\n/g, '\n');
                hoverMd.appendMarkdown(`\n---\n${cleanDescription}`);
            } else {
                hoverMd.appendMarkdown(`\n---\n*(⚠️ Geen description gevonden in mispl.code-snippets voor '${snippetMatch.prefix}')*`);
            }
            
            return new vscode.Hover(hoverMd, wordRange);
        }

        return null;
    }
}

function registerHoverProvider(context) {
    loadSnippets(context);
    context.subscriptions.push(
        vscode.languages.registerHoverProvider('mispl', new MisplHoverProvider())
    );
}

module.exports = registerHoverProvider;