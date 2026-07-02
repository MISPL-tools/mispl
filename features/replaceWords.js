const vscode = require("vscode");
const fs = require("fs");
const path = require("path");

function replaceWords(context) {
	const editor = vscode.window.activeTextEditor;
	if (!editor) return;

	const document = editor.document;

	// 1. Lees de JSON in
	const replaceFilePath = path.join(context.extensionPath, "replaceWords.json");
	let replaceList;
	try {
		const raw = fs.readFileSync(replaceFilePath, "utf8");
		replaceList = JSON.parse(raw);
	} catch (err) {
		vscode.window.showErrorMessage("Kon replaceWords.json niet lezen.");
		return;
	}

	// 2. Maak een efficiënte Lookup Map én een gesorteerde sleutellijst
	const lookupMap = new Map();
	const sortedKeys = [];

	for (const [key, value] of Object.entries(replaceList)) {
		const lowerKey = key.toLowerCase();
		lookupMap.set(lowerKey, value);
		sortedKeys.push(lowerKey);
	}

	// Sorteer de sleutels op lengte (langste eerst). 
	// Hierdoor matcht 'TheResultVorig' netjes met 'theresult' en wordt hij niet per ongeluk halverwege afgekapt als 'the' ook in de lijst zou staan.
	sortedKeys.sort((a, b) => b.length - a.length);

	const fullText = document.getText();

	// 3. De Slimme Regex (ongewijzigd, pakt nog steeds hele woorden)
	const tokenizer = /("(?:[^"\\]|\\.)*"|\/\*[\s\S]*?\*\/|\/\/.*)|(\b\w+\b)/g;

	const newText = fullText.replace(tokenizer, (match, protectedContent, word) => {
		// A. Is het een String of Commentaar? Blijf eraf!
		if (protectedContent) {
			return protectedContent;
		}

		// B. Is het een woord?
		if (word) {
			const lowerWord = word.toLowerCase();
			let matchedKey = null;

			// Zoek of het woord BEGINT met een term uit onze lijst
			for (const key of sortedKeys) {
				if (lowerWord.startsWith(key)) {
					matchedKey = key;
					break;
				}
			}

			// Hebben we een match (bijv. 'theresult' zit in 'theresultvorig')?
			if (matchedKey) {
				const replacement = lookupMap.get(matchedKey); // bijv. "rslt"
				let suffix = word.substring(matchedKey.length); // bijv. "vorig" of "Vorig"

				// Als er een achtervoegsel is, zorg dat het netjes met een hoofdletter begint (CamelCase)
				if (suffix.length > 0) {
					suffix = suffix.charAt(0).toUpperCase() + suffix.slice(1);
				}

				// Plak de nieuwe prefix en de (eventuele) suffix aan elkaar
				return replacement + suffix;
			}

			// Geen match? Laat het woord intact.
			return word;
		}

		// Fallback
		return match;
	});

	// 4. Update de editor alleen als er iets veranderd is
	if (fullText !== newText) {
		editor.edit(edit => {
			edit.replace(
				new vscode.Range(
					document.positionAt(0),
					document.positionAt(fullText.length)
				),
				newText
			);
		});
		vscode.window.showInformationMessage("Code termen bijgewerkt naar nieuwe standaard (inclusief achtervoegsels)!");
	} else {
		vscode.window.showInformationMessage("Geen termen gevonden om te vervangen.");
	}
}

module.exports = replaceWords;