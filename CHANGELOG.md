## [3.2.1] - 2026-07-10
### 🚀 A MISPL summary in the comments and bug fixes

#### ✨ New Features
* **Automated MISPL Action Summary:** Added a new command (`Right-Click > MISPL: Add Summary to MISPL`) that analyzes the script locally and generates a human-readable summary of all actions (e.g., explicit database requests, evaluated results, user interactions, and loops). It intelligently inserts or replaces the summary in the header comment block without breaking existing documentation. Completely local (no external AI required) and fully multi-language supported.

#### 🐛 Bug Fixes & Improvements
* **Smarter 'Remove Unused Variables':** Completely rebuilt the removal engine to strictly sync with the AST linter. It now safely ignores variables inside comment blocks and flawlessly handles complex, irregularly spaced comma-separated declarations without breaking syntax.
* **Intelligent Hungarian Notation Suggestions:** The linter now utilizes a document-wide "Helicopter View" to prevent duplicate variable naming suggestions (e.g., suggesting `sEiwit2` if `sEiwit` already exists). It also proactively strips data types from variable names (intelligently converting `OrderRel` to `ordRel` instead of the redundant `ordOrderRel`).
* **Loop Performance Diagnostics:** Upgraded the performance analysis inside `WHILE` and `REPEAT` loops. The linter now correctly detects and warns against chained database references (e.g., `.Result.Order`) and inefficient `AddRequest` calls inside loops.
* **Strict GLIMS Syntax Validation:** Removed the plural `AddRequests` from the known methods whitelist. The linter will now correctly flag it as a non-existent method, enforcing the use of the singular `.AddRequest()` in GLIMS.


## [3.1.0] - 2026-07-07
### Version 3.1.0 - The Linter & Logic Update 🚀
This release introduces a series of critical bug fixes for the linter, smarter scope analysis, and the highly requested ability to ignore specific linter warnings locally.

#### ✨ New Features
The /*Ign@re*/ Tag & Quick Fix: Sometimes you intentionally deviate from best practices for the sake of readability. By appending the new /*Ign@re*/ comment tag to a line, you can mute the linter for that specific line.

Convenience: This has been integrated as a Code Action (Quick Fix). Simply click the lightbulb next to a warning (or use Ctrl+.) to add the tag with a single click!

Dead Code Detection: The linter now detects unreachable code following a RETURN statement and generates a style tip. This feature is fully scope-aware: a RETURN inside an IF block naturally will not affect the code following the ENDIF.

#### 🐛 Bug Fixes
Linter Memory Loss (Assignments): Fixed a critical issue where assignments (:=) to existing variables and loop counters (e.g., I:=0) were occasionally not registered, resulting in unjustified red crosses (unused/undeclared variables).

Overly Aggressive 'Replace Words': The logic for replacing variables (e.g., Ordr to Ord) has been significantly improved.

Exact matches are now strictly prioritized.

Standard GLIMS classes (such as Order, Result, Correspondent) are now protected, preventing class declarations from being unintentionally mangled (no more ORDer Ord).

Silent Errors on Unknown Functions (.abcdefh()): The linter previously stayed silent when an implicit, non-existent method was called on an object. This now immediately results in a hard error.

False Positives on GLIMS Verbs: To enable the fix above, a built-in 'Whitelist' has been added containing native GLIMS actions (like Cancel, Confirm, Validate, IsGroupMember). These are generally not included in dictionary exports but are now 100% linter-proof.

"Remove Unused Declarations" Fix: The variable cleanup via the context menu frequently failed due to asynchronous line numbering when large comment blocks (/* ... */) were present at the top of the script. This feature has been completely rewritten into a robust, AST-based, and comment-ignoring routine.

🌍 Under the Hood
All new features and warnings (such as dead code and the Quick Fix) are immediately available and fully translated into English, Dutch, German, and French.

Variable scopes (currentDepth and returnDepth) within the abstract syntax tree (AST) are now more strictly defined to improve error detection.