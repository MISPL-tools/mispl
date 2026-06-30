// analyzeMISPL.js (Dit bestand staat in je hoofdmap)

// Importeer de logica uit de opgesplitste bestanden
const { parseMISPL } = require("./engine/parser");
const { analyze } = require("./engine/analyzer_logic");

// De versie van de linter
const VERSION = "v2.80.0 - Modular Engine Update (Fixes that make everybody happy)";

// Exporteer ze zodat extension.js ze kan gebruiken
module.exports = { parseMISPL, analyze, VERSION };