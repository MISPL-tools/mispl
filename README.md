# MISPL Language Support for Visual Studio Code

![Visual Studio Code](https://img.shields.io/badge/Visual%20Studio%20Code-007ACC?style=for-the-badge&logo=visual-studio-code&logoColor=white)
![Version](https://img.shields.io/badge/version-3.0.1-blue.svg)

**MISPL** (*MIPS Scripting Language*) is a powerful scripting language used to customize and extend the **Clinisys GLIMS** Laboratory Information System. This extension brings modern IDE features to VS Code, making MISPL development faster, cleaner, and less prone to errors.

> [!IMPORTANT]  
> **Independent Development:** This module is an independently developed third-party tool. Clinisys does not provide technical support for this extension and is not responsible for any errors caused by its use.

---

## ✨ Key Features & Tools

### 🧠 Intelligent Coding & Navigation
Write code faster with smart suggestions, context-aware hovers, and instant error detection.

<details>
  <summary><b>🔍 Hover, Linting & Quick Fixes</b></summary>
  <br>
  Hovering over a variable shows its type, its last assignment, and how many times it is present. In the Problems window, Errors, Warnings, and Style-tips are shown. Using the right mouse menu (or the Quick Fix lightbulb) shows an automatic quick fix in many cases.<br><br>
  <img src="images/HoverAndFix.gif" width="100%" alt="Hover and Quick Fixes">
</details>

<details>
  <summary><b>💡 IntelliSense (Snippets)</b></summary>
  <br>
  Hover over any standard GLIMS function (e.g., <code>AddLogEntry</code>) to instantly view parameter requirements and documentation. Use smart autocomplete snippets to build complex blocks in seconds.<br><br>
  <img src="images/SnippetsEnHover.gif" width="100%" alt="IntelliSense and Snippets">
</details>

<details>
  <summary><b>🗺️ Code-Map (Outline)</b></summary>
  <br>
  Navigate complex scripts easily with the Outline panel. View declared variables by type and jump directly to specific <code>IF</code> and <code>WHILE</code> blocks.<br><br>
  <img src="images/Outline_nieuw.gif" width="100%" alt="Code Outline">
</details>

### 🛠️ Refactoring & Formatting
Keep your codebase clean, readable, and perfectly structured with automated tools.

<details>
  <summary><b>🧹 Remove Unused Variables</b></summary>
  <br>
  Automatically scans your declarations and surgically removes variables that are never used in the script.<br><br>
  <img src="images/06_RemoveUnusedVariables.gif" width="100%" alt="Remove Unused Variables">
</details>

<details>
  <summary><b>📏 Align Assignments</b></summary>
  <br>
  Select a block of code and align all <code>:=</code> operators vertically for maximum readability.<br><br>
  <img src="images/05_Align.gif" width="100%" alt="Align Assignments">
</details>

<details>
  <summary><b>📦 Wrap in Block</b></summary>
  <br>
  Instantly wrap selected lines of code in an <code>IF</code>, <code>WHILE</code>, or <code>REPEAT</code> block with proper indentation (Shortcut: <code>Ctrl+Alt+W</code>).<br><br>
  <img src="images/04_WrapIn.gif" width="100%" alt="Wrap In Block">
</details>

<details>
  <summary><b>✂️ Extract to Variable</b></summary>
  <br>
  Select a complex expression, right-click, and extract it to automatically declare and assign a new variable at the top of your script.<br><br>
  <img src="images/02_ExtractToVariable.gif" width="100%" alt="Extract To Variable">
</details>

<details>
  <summary><b>📝 Format, Compact & Minify</b></summary>
  <br>
  Format your code perfectly, remove redundant whitespace, or aggressively minify your script to stay under the GLIMS 31,000-character limit.<br><br>
  <img src="images/01_Format.gif" width="100%" alt="Format Code"><br>
  <img src="images/08_CompactCode.gif" width="100%" alt="Compact Code"><br>
  <img src="images/09_Minifier.gif" width="100%" alt="Minifier">
</details>

---

## ⚙️ Extension Settings

Use `File > Preferences > Settings` to open the settings window. Search for `MISPL` to find specific settings items such as language, or the type of desired formatting for your MISPLs.

<details>
  <summary><b>⚙️ View Settings Panel</b></summary>
  <br>
  <img src="images/MISPLSettings.gif" width="100%" alt="MISPL Settings">
</details>

*   **`mispl.language`**: Set the language for the linter, pop-ups, and Quick Fixes (Auto, English, Dutch, French, or German).
*   **`mispl.formattingStyle`**: Choose between the Standard format or the Clinisys Multi-line format (which places `THEN`, `DO`, and `UNTIL` on new lines).
*   **`mispl.glimsUsername`**: Your personal GLIMS login name, used to generate safe, user-targeted debug messages.
*   **`mispl.customDictionary`**: Path to your local GLIMS definitions. 
    *   *How to use:* The extension includes a `custom_glims_dict_template.json` file. Copy this template to a safe local folder, add your laboratory's custom Site Functions and Tables, and link the file path in this setting to enable IntelliSense and Hover support for your custom code!

---

## 🧪 Batch Testing (Mass Validation)

Taking over a database with thousands of legacy MISPL scripts is challenging. This extension includes **Batch Test Tools** to validate your entire GLIMS environment at once.

<details>
  <summary><b>📊 See Batch Validation in action</b></summary>
  <br>
  <b>Usage:</b><br>
  1. Export your MISPL table (<code>gp_SiteFunction</code>) from GLIMS as a <code>.csv</code> file.<br>
  2. Open the Folder ".\mispl\batchTest" in VS Code.<br>
  3. Run the Batch tool via Node.js in the <code>Terminal</code>.<br>
  4. Use <code>runBatchToExcel.js</code> for an Excel overview of all Errors, Warnings, and Style Tips, <code>batchTest.js</code> for Errors only, and <code>unitTest.js</code> to test the Linter.<br>
  5. The engine parses thousands of scripts in seconds and produces a comprehensive report of all fatal crashes and syntax errors.<br><br>
  <img src="images/runBatchToExcel.gif" width="100%" alt="Batch Testing">
</details>

---

## 👣 Runtime Validation (Breadcrumbs)

Troubleshooting production code is difficult. The **Validation Flow** feature solves this by automatically injecting trace code into your script.

<details>
  <summary><b>🕵️‍♂️ Coverage Analysis (Dead-Code Detection)</b></summary>
  <br>
  1. <b>Inject:</b> The tool safely injects tracking codes (<code>_sV</code>) at every logical crossroad.<br>
  2. <b>Execute:</b> Run the script in GLIMS. The breadcrumb trail is written to the GLIMS log.<br>
  3. <b>Analyze:</b> Copy the log string to VS Code and run the analysis. A Markdown report will show you exactly which paths were executed and which were skipped.<br><br>
  <img src="images/Kruimelspoor.gif" width="100%" alt="Validation Flow Coverage">
</details>

---

## 🌳 Flowcharts & AST Visualizations

Transform your code into visual logic to simplify complex scripts for documentation or consultation.

<details>
  <summary><b>🔀 Interactive Flowcharts</b></summary>
  <br>
  Generate interactive Mermaid.js flowcharts for your script. Click on any block in the diagram to instantly jump to the corresponding line of code in your editor.<br><br>
  <img src="images/11_ShowFlowChart.gif" width="100%" alt="Flowcharts">
</details>

<details>
  <summary><b>🌲 Print AST (Abstract Syntax Tree)</b></summary>
  <br>
  Convert your MISPL script into a clean, hierarchical tree structure that reveals how the parser interprets the logic.<br><br>
  <img src="images/12_ShowAST.gif" width="100%" alt="AST Generator">
</details>

---

## 🕹️ Command Overview

All tools are quickly accessible via the Command Palette (`Ctrl+Shift+P`) or the MISPL Tool Menu (`Ctrl+Alt+M` or `Ctrl+Alt+Q`).

| Command                              | Description                                                                  |
| :----------------------------------- | :--------------------------------------------------------------------------- |
| `MISPL: Show Tools Menu`             | Opens an interactive quick-menu with all available commands.                 |
| `MISPL: Extract to Variable`         | Extracts selected code into a newly declared variable.                       |
| `MISPL: Insert Magic Debug`          | Injects a safe `Message()` log statement for the selected variable.          |
| `MISPL: Wrap in IF / WHILE`          | Wraps selected lines in a conditional or loop block.                         |
| `MISPL: Align Assignments`           | Vertically aligns all `:=` operators in the selection.                       |
| `MISPL: Remove Unused Variables`     | Automatically cleans up unused variable declarations.                        |
| `MISPL: Compact Code`                | Formats code and removes redundant whitespace.                               |
| `MISPL: Minifier`                    | Aggressively minifies code to save database space.                           |
| `MISPL: Replace Words...`            | Replaces words based on a custom mapping list.                               |
| `MISPL: Show Flowchart`              | Generates a visual flowchart of the current script.                          |
| `MISPL: Inject Validation Flow`      | Injects `_sV` breadcrumbs for runtime logging in GLIMS.                      |
| `MISPL: Remove Validation Flow`      | Safely removes all injected tracking codes.                                  |
| `MISPL: Analyze Coverage`            | Translates GLIMS log output into a Markdown coverage report.                 |
| `MISPL: Print AST`                   | Generates a hierarchical Abstract Syntax Tree of the script.                 |

---

## 📦 Installation
1. Open Visual Studio Code.
2. Go to the Extensions view (`Ctrl+Shift+X`).
3. Search for **MISPL Language Support**.
4. Click **Install**.

## 🐞 Reporting Issues
Help improve the engine! If you encounter an incorrect linting error or a specific edge case in GLIMS:
1. Send an email to: `d.w.koppenaal@umcutrecht.nl`
2. Include a minimal MISPL code example that reproduces the issue.
3. Describe the expected behavior versus what the linter actually does.