const fs = require("fs");
const path = require("path");
const { parseMISPL, analyze, VERSION } = require("./analyzeMISPL");

// We maken een array aan om alle tekst op te vangen voor het logbestand
const reportLines = [];

// Deze custom log-functie print naar de terminal én slaat het op voor ons tekstbestand
function log(message) {
	console.log(message);
	reportLines.push(message);
}

log("=========================================");
log(`🧪 MISPL LINTER - ADVANCED UNIT TEST`);
log(`Linter Engine: ${VERSION}`);
log("=========================================\n");

const testFilePath = path.join(__dirname, "bad_scripts.txt");
const reportFilePath = path.join(__dirname, "unit_test_rapport.txt");

if (!fs.existsSync(testFilePath)) {
	log(`❌ FOUT: Kan ${testFilePath} niet vinden.`);
	fs.writeFileSync(reportFilePath, reportLines.join("\n"), "utf8");
	process.exit(1);
}

const rawBlocks = fs.readFileSync(testFilePath, "utf8").split(/={10,}/);
const testCases = [];

rawBlocks.forEach(block => {
	const lines = block.trim().split(/\r?\n/);
	if (lines.length < 3) return;

	let testName = "Onbekende Test";
	let expectedText = "";
	let expectedType = "ERROR"; // Default
	let codeLines = [];

	lines.forEach(line => {
		if (line.startsWith("=== NAME:")) testName = line.replace("=== NAME:", "").trim();
		else if (line.startsWith("=== EXPECT:")) expectedText = line.replace("=== EXPECT:", "").trim();
		else if (line.startsWith("=== EXPECT_TYPE:")) expectedType = line.replace("=== EXPECT_TYPE:", "").trim().toUpperCase();
		else codeLines.push(line);
	});

	testCases.push({ name: testName, expectedText, expectedType, code: codeLines.join("\n").trim() });
});

let passed = 0;
let failed = 0;

const severityMap = { "ERROR": 8, "WARNING": 4, "INFO": 2, "TIP": 2 };

testCases.forEach((test, index) => {
	const parseResult = parseMISPL(test.code);
	const diagnostics = analyze(parseResult, test.code);

	const targetSeverity = severityMap[test.expectedType] || 8;

	let match;
	if (test.expectedText === "NONE") {
		match = (diagnostics.length === 0);
	} else {
		match = diagnostics.find(d =>
			d.message.toLowerCase().includes(test.expectedText.toLowerCase()) &&
			d.severity === targetSeverity
		);
	}

	if (match) {
		log(`✅ [OK] Test ${index + 1}: ${test.name} (${test.expectedType} gevonden)`);
		passed++;
	} else {
		log(`❌ [FAIL] Test ${index + 1}: ${test.name}`);
		log(`   Verwacht: ${test.expectedType} met tekst "${test.expectedText}"`);
		if (diagnostics.length > 0) {
			log(`   Gevonden diagnostics:`);
			diagnostics.forEach(d => log(`     - [Sev ${d.severity}] ${d.message}`));
		} else {
			log(`   Gevonden diagnostics: GEEN (Linter bleef stil)`);
		}
		failed++;
	}

	// De strakke scheidingslijn tussen elke test
	log("====================");
});

log("\n=========================================");
log(`📊 RESULTAAT: ${passed} geslaagd, ${failed} gefaald.`);
if (failed === 0) log("🎉 De linter herkent alle fouten, waarschuwingen en tips!");
log("=========================================");

// Schrijf alle opgevangen tekst in één keer naar een .txt bestand
try {
	fs.writeFileSync(reportFilePath, reportLines.join("\n"), "utf8");
	console.log(`\n📄 Het volledige testrapport is opgeslagen als: ${path.basename(reportFilePath)}`);
} catch (err) {
	console.error(`\n❌ Kon het testrapport niet opslaan: ${err.message}`);
}