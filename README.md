# MISPL Language Support for Visual Studio Code

**MISPL** (*MIPS Scripting Language*) is een krachtige scripttaal die wordt gebruikt voor het aanpassen en uitbreiden van het **Clinisys GLIMS** Laboratorium Informatie Systeem. Deze extensie brengt moderne IDE-functies naar VS Code, waardoor MISPL-ontwikkeling sneller, overzichtelijker en minder foutgevoelig wordt.

> [!IMPORTANT]  
> **Onafhankelijke Ontwikkeling:** Deze module is een onafhankelijk ontwikkelde tool van derden. Clinisys biedt geen technische ondersteuning voor deze extensie en is niet verantwoordelijk voor eventuele fouten veroorzaakt door het gebruik ervan.

---

## ✨ Kernfuncties & Tools

### 🧠 Intelligent Coderen & Navigatie
Schrijf sneller code met slimme suggesties en directe foutdetectie.

<details>
  <summary><b>🔍 Statische Analyse (Linting)</b></summary>
  <br>
  Identificeer bugs in het VS Code <b>Problems</b> paneel <i>voordat</i> je ze naar GLIMS kopieert. Detecteert ontbrekende <code>ENDIF</code>, ongedeclareerde variabelen, oneindige lussen en handhaaft de GLIMS-naamgevingsconventies (Hongaarse Notatie).<br><br>
  <img src="images/StaticDebug.gif" width="100%" alt="Static Debug">
</details>

<details>
  <summary><b>💡 IntelliSense (Snippets & Hover)</b></summary>
  <br>
  Beweeg je muis over GLIMS-functies (bijv. <code>AddLogEntry</code>) om direct parametervereisten en documentatie te zien. Gebruik slimme autocomplete-snippets om complexe blokken in seconden te bouwen.<br><br>
  <img src="images/SnippetsEnHover.gif" width="100%" alt="IntelliSense and Hover">
</details>

<details>
  <summary><b>🗺️ Code-Map (Outline)</b></summary>
  <br>
  Navigeer eenvoudig door complexe scripts met het Outline-paneel. Bekijk gedeclareerde variabelen per type en spring direct naar specifieke <code>IF</code> en <code>WHILE</code> blokken.<br><br>
  <img src="images/Outline_nieuw.gif" width="100%" alt="Code Outline">
</details>

### 🛠️ Refactoring & Formattering
Houd je code schoon, leesbaar en perfect gestructureerd met geautomatiseerde tools.

<details>
  <summary><b>🧹 Ongebruikte Variabelen Verwijderen</b></summary>
  <br>
  Scant automatisch je declaraties en verwijdert chirurgisch de variabelen die nergens in het script worden gebruikt.<br><br>
  <img src="images/06_RemoveUnusedVariables.gif" width="100%" alt="Remove Unused Variables">
</details>

<details>
  <summary><b>📏 Toewijzingen Uitlijnen (Align)</b></summary>
  <br>
  Selecteer een blok code en lijn alle <code>:=</code> operatoren verticaal uit voor maximale leesbaarheid.<br><br>
  <img src="images/05_Align.gif" width="100%" alt="Align Assignments">
</details>

<details>
  <summary><b>📦 Inpakken in Blok (Wrap in Block)</b></summary>
  <br>
  Verpak geselecteerde regels code direct in een <code>IF</code>, <code>WHILE</code> of <code>REPEAT</code> blok met de juiste inspringing (Sneltoets: <code>Ctrl+Alt+W</code>).<br><br>
  <img src="images/04_WrapIn.gif" width="100%" alt="Wrap In Block">
</details>

<details>
  <summary><b>✂️ Variabele Extraheren</b></summary>
  <br>
  Selecteer een complexe expressie, klik met de rechtermuisknop en extraheer deze om automatisch een nieuwe variabele te declareren en toe te wijzen bovenaan je script.<br><br>
  <img src="images/02_ExtractToVariable.gif" width="100%" alt="Extract To Variable">
</details>

<details>
  <summary><b>📝 Formatteren, Compacten & Minificeren</b></summary>
  <br>
  Formatteer je code perfect, verwijder overbodige witruimte of minificeer je code agressief om onder de GLIMS-limiet van 31.000 tekens te blijven.<br><br>
  <img src="images/01_Format.gif" width="100%" alt="Format Code"><br>
  <img src="images/08_CompactCode.gif" width="100%" alt="Compact Code"><br>
  <img src="images/09_Minifier.gif" width="100%" alt="Minifier">
</details>

---

## 🧪 Batch Testing (Massale Validatie)

Het overnemen van een database met duizenden verouderde MISPL-scripts is een uitdaging. Deze extensie bevat **Batch Test Tools** om je volledige GLIMS-omgeving in één keer te valideren. 

<details>
  <summary><b>📊 Bekijk de Batch Validatie in actie</b></summary>
  <br>
  <b>Gebruik:</b><br>
  1. Exporteer je MISPL-tabel (<code>gp_SiteFunction</code>) uit GLIMS als een <code>.csv</code> bestand.<br>
  2. Open de Folder ".\mispl\batchTest" in VSC.<br>
  3. Voer in <code>Terminal</code> de Batch-tool uit via Node.js.<br>
  4. Gebruik <code>runBatchToExcel.js</code> voor een Excel overzicht van alle Fouten, Waarschuwingen en Stijl-Tips, <code>batchTest.js</code> voor alleen de Fouten, en <code>unitTest.js</code> om de Linter te testen<br>
  5. De engine parst duizenden scripts in seconden en produceert een rapport met alle fatale crashes en syntaxfouten.<br><br>
  <img src="images/runBatchToExcel.gif" width="100%" alt="Batch Testing">
</details>

---

## 👣 Runtime Validatie (Kruimelspoor)

Het oplossen van problemen in productie is lastig. De **Validation Flow** functie lost dit op door automatisch breadcrumbs in je code te injecteren.

<details>
  <summary><b>🕵️‍♂️ Dekkingsanalyse (Dead-Code Detectie)</b></summary>
  <br>
  1. <b>Injecteren:</b> De tool injecteert veilig trackingcodes (<code>_sV</code>) op elk logisch kruispunt.<br>
  2. <b>Uitvoeren:</b> Voer het script uit in GLIMS. Het spoor wordt naar het log geschreven.<br>
  3. <b>Analyseren:</b> Kopieer de log-string naar VS Code en draai de analyse. Een rapport laat precies zien welke paden zijn doorlopen.<br><br>
  <img src="images/Kruimelspoor.gif" width="100%" alt="Validation Flow Coverage">
</details>

---

## 🌳 Flowcharts & AST Visualisaties

Transformeer je code in visuele logica om complexe scripts te vereenvoudigen voor documentatie of overleg.

<details>
  <summary><b>🔀 Interactieve Flowcharts</b></summary>
  <br>
  Genereer interactieve Mermaid.js-stroomdiagrammen voor je script. Klik op een blok in het diagram om direct naar de bijbehorende regel code te springen.<br><br>
  <img src="images/11_ShowFlowChart.gif" width="100%" alt="Flowcharts">
</details>

<details>
  <summary><b>🌲 Print AST (Abstract Syntax Tree)</b></summary>
  <br>
  Converteer je MISPL-script naar een schone, hiërarchische boomstructuur die de logica van de parser laat zien.<br><br>
  <img src="images/12_ShowAST.gif" width="100%" alt="AST Generator">
</details>

---

## 🕹️ Commando Overzicht

Alle tools zijn snel toegankelijk via het Command Palette (`Ctrl+Shift+P`) of het MISPL Tool Menu (`Ctrl+Alt+M`).

| Commando                             | Beschrijving                                                                 |
| :----------------------------------- | :--------------------------------------------------------------------------- |
| `MISPL: Show Tools Menu`             | Opent een interactief menu met alle beschikbare commando's.                  |
| `MISPL: Extract to Variable`         | Extraheert geselecteerde code naar een nieuwe variabele.                     |
| `MISPL: Insert Magic Debug`          | Injecteert een veilige `Message()` log voor de geselecteerde variabele.      |
| `MISPL: Wrap in IF / WHILE`          | Verpakt geselecteerde regels in een conditioneel of loop-blok.               |
| `MISPL: Align Assignments`           | Lijnt alle `:=` operatoren verticaal uit in de selectie.                     |
| `MISPL: Remove Unused Variables`     | Verwijdert automatisch ongebruikte variabelen uit declaraties.               |
| `MISPL: Compact Code`                | Formatteert code en verwijdert overbodige witruimte.                         |
| `MISPL: Minifier`                    | Minificeert code agressief om database-ruimte te besparen.                   |
| `MISPL: Replace Words...`            | Vervangt woorden op basis van een aangepaste mapping-lijst.                  |
| `MISPL: Show Flowchart`              | Genereert een visueel stroomdiagram van het huidige script.                  |
| `MISPL: Inject Validation Flow`      | Injecteert `_sV` breadcrumbs voor runtime logging.                           |
| `MISPL: Remove Validation Flow`      | Verwijdert veilig alle geïnjecteerde tracking codes.                         |
| `MISPL: Analyze Coverage`            | Vertaalt GLIMS log-output naar een dekkingsrapport.                          |
| `MISPL: Print AST`                   | Genereert een hiërarchische boomstructuur van het script.                    |

---

## 📦 Installatie
1. Open Visual Studio Code.
2. Ga naar de Extensions view (`Ctrl+Shift+X`).
3. Zoek naar **MISPL Language Support**.
4. Klik op **Install**.

## 🐞 Problemen Melden
Help ons de engine te verbeteren! Als je een foutieve melding ziet of een specifiek GLIMS-geval tegenkomt:
1. Stuur een e-mail naar: `d.w.koppenaal@umcutrecht.nl`
2. Voeg een minimaal MISPL-codevoorbeeld toe waarmee het probleem gereproduceerd kan worden.
3. Beschrijf wat het verwachte gedrag is versus wat de linter doet.