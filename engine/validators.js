const Validators = {
	checkHungarianNotation(node, context) {
		const dataType = node.datatype || node.dataType || node.varType || node.typeValue;
		if (!dataType || !node.name || node.name === "_sV") return;

		const typeKey = String(dataType).toLowerCase();
		if (typeKey === "integer" && /^[IJK]$/i.test(node.name)) return;

		const validPrefixes = PREFIXES[typeKey];
		if (validPrefixes) {
			const nameLower = String(node.name).toLowerCase();

			if (validPrefixes.some(p => p.toLowerCase() === nameLower)) return;

			const isValidCamel = validPrefixes.some(prefix => {
				if (nameLower.startsWith(prefix.toLowerCase())) {
					const remainder = node.name.substring(prefix.length);
					if (remainder.length > 0) return /^[A-Z0-9_]/.test(remainder[0]);
				}
				return false;
			});

			if (!isValidCamel) {
				let cleanName = String(node.name);
				if (/^[a-z]+[A-Z]/.test(cleanName)) cleanName = cleanName.replace(/^[a-z]+/, '');
				cleanName = cleanName.charAt(0).toUpperCase() + cleanName.slice(1);
				context.addInfo(node.line, `👮 Stijl-tip: Variabele '${node.name}' is type '${dataType}'. Conventie: '${validPrefixes[0]}' (bijv. '${validPrefixes[0] + cleanName}' of gewoon '${validPrefixes[0]}').`);
			}
		}
	},

	analyzeScope(node, context) {
		if (node.type === NodeTypes.Declaration) {
			context.registerDeclaration(node.name, node.line, node.dataType || node.datatype || "UNKNOWN");
			this.checkHungarianNotation(node, context);
		}

		if (node.type === NodeTypes.Assignment) {
			const valClean = node.value ? String(node.value).trim().toUpperCase() : "";
			if (valClean === '""') context.addInfo(node.line, `💡 Code-tip: GLIMS initialiseert Strings automatisch als "".`);
		}

		let exprToAnalyze = null;
		let targetVarName = null;

		if (node.type === NodeTypes.Assignment) {
			exprToAnalyze = node.value;
			targetVarName = node.name;
		}
		else if (node.type === NodeTypes.IfStatement) exprToAnalyze = node.condition;
		else if (node.type === NodeTypes.WhileStatement) exprToAnalyze = node.condition;
		else if (node.type === NodeTypes.ReturnStatement) exprToAnalyze = node.expression;
		else if (node.type === NodeTypes.GenericStatement) exprToAnalyze = node.condition || node.text;

		if (exprToAnalyze) {
			ExpressionParser.extractReferences(String(exprToAnalyze), node.line, context);
			TypeChecker.evaluate(exprToAnalyze, node.line, context, targetVarName);
		}

		if (node.type === NodeTypes.Assignment) {
			context.registerWrite(node.name, node.line);
			context.registerAssignment(node.name, node.value);
		}
	},

	analyzeStructure(node, context) { },

	analyzeLoops(nodes, context) {
		if (!Array.isArray(nodes)) return;
		const getVarsInExpr = (expr) => {
			if (!expr) return [];
			const matches = String(expr).match(/[a-zA-Z_][a-zA-Z0-9_]*/g) || [];
			const reserved = new Set(["IF", "THEN", "ELSE", "ENDIF", "WHILE", "DO", "DONE", "REPEAT", "UNTIL", "RETURN", "AND", "OR", "NOT", "TRUE", "FALSE", "YES", "NO", "LT", "LE", "GT", "GE", "EQ", "NE", "STR"]);
			return matches.filter(m => !reserved.has(m.toUpperCase()) && isNaN(m));
		};

		const heavyFuncList = ["Expand", "GetSiteAttribute", "Lookup", "GetLogEntry", "GetResult", "GetCode", "GetMedicalRecord", "GetEncounter"];
		const iteratorFunctions = /\b(GetSpecimen|GetAction|GetRequests|GetResults|GetPriorResult|GetNextResult|GetResult)\s*\(/i;

		for (let i = 0; i < nodes.length; i++) {
			const node = nodes[i];
			let loopCondition = null, blockEnd = -1, type = null;

			if (node.type === NodeTypes.WhileStatement) { loopCondition = node.condition; type = 'WHILE'; }
			else if (node.type === NodeTypes.RepeatStatement) type = 'REPEAT';
			else continue;

			let depth = 1;
			for (let k = i + 1; k < nodes.length; k++) {
				const sub = nodes[k];
				if ([NodeTypes.WhileStatement, NodeTypes.RepeatStatement, NodeTypes.IfStatement].includes(sub.type)) depth++;
				if (sub.type === "Done" || sub.type === "EndIf" || sub.isUntil) {
					depth--;
					if (depth === 0) {
						if (type === 'REPEAT' && sub.isUntil) loopCondition = sub.condition;
						blockEnd = k; break;
					}
				}
			}

			if (loopCondition && blockEnd > -1) {
				const conditionVars = getVarsInExpr(loopCondition).map(v => v.toLowerCase());
				const assignedInLoop = new Set();
				const loopAssignments = [];
				let hasIterator = false;

				for (let m = i + 1; m < blockEnd; m++) {
					const subNode = nodes[m];
					if (subNode.type === NodeTypes.Assignment) {
						const targetName = String(subNode.name).toLowerCase();
						assignedInLoop.add(targetName);
						loopAssignments.push({ target: targetName, expr: subNode.value });
					}
					let exprToCheck = subNode.value || subNode.condition || subNode.expression || subNode.text;
					if (exprToCheck && iteratorFunctions.test(String(exprToCheck))) {
						hasIterator = true;
					}
				}

				// FIX: Diepte-bewuste functie argumenten checker ter vervanging van de oude RegEx
				for (let m = i + 1; m < blockEnd; m++) {
					const subNode = nodes[m];
					let exprToCheck = subNode.value || subNode.condition || subNode.expression || subNode.text;
					if (exprToCheck) {
						const safeExpr = String(exprToCheck);
						if (safeExpr.toLowerCase().includes(".addrequest(")) context.addInfo(subNode.line, `💡 Prestatie-tip: Verzamel .AddRequest() buiten de lus.`);

						for (let hFunc of heavyFuncList) {
							const regexTest = new RegExp(`\\b${hFunc}\\s*\\(`, 'gi');
							let match;
							while ((match = regexTest.exec(safeExpr)) !== null) {
								let start = match.index + match[0].length;
								let parenCount = 1;
								let p = start;
								let inStr = false;
								let strChar = '';

								while (p < safeExpr.length && parenCount > 0) {
									const c = safeExpr[p];
									if (!inStr && (c === '"' || c === "'")) {
										inStr = true; strChar = c;
									} else if (inStr && c === strChar) {
										if (p + 1 < safeExpr.length && safeExpr[p + 1] === strChar) p++;
										else inStr = false;
									} else if (!inStr) {
										if (c === '(') parenCount++;
										else if (c === ')') parenCount--;
									}
									p++;
								}

								// Dit is de EXACTE tekst tussen de haakjes van de functie
								const argsStr = safeExpr.substring(start, p - 1);

								let isDependent = false;
								for (let av of getVarsInExpr(argsStr)) {
									if (assignedInLoop.has(av.toLowerCase())) { isDependent = true; break; }
								}
								if (!isDependent) {
									context.addInfo(subNode.line, `⚡ Prestatie-tip: '${hFunc}' staat in een loop maar argumenten wijzigen niet. Bereken dit 1x voor de loop en gebruik een variabele!`);
								}
							}
						}
					}
				}

				let isProperlyUpdated = false;
				let staticAssignmentWarning = null;

				for (let condVar of conditionVars) {
					if (assignedInLoop.has(condVar)) {
						let hasValidUpdate = false;

						for (let assign of loopAssignments) {
							if (assign.target === condVar) {
								const rhsVars = getVarsInExpr(assign.expr).map(v => v.toLowerCase());

								if (rhsVars.length === 0) {
									hasValidUpdate = true;
								} else {
									let rhsIsDynamic = false;
									for (let rv of rhsVars) {
										if (assignedInLoop.has(rv)) {
											rhsIsDynamic = true;
											break;
										}
									}

									if (iteratorFunctions.test(String(assign.expr))) {
										rhsIsDynamic = true;
									}

									if (rhsIsDynamic) {
										hasValidUpdate = true;
									}
								}
							}
						}

						if (hasValidUpdate) {
							isProperlyUpdated = true;
							break;
						} else {
							staticAssignmentWarning = `Variabele '${condVar}' krijgt in de loop een waarde via andere variabelen, maar geen van die variabelen verandert. Ben je vergeten een index (zoals 'I') op te hogen?`;
						}
					}
				}

				if (conditionVars.length > 0 && !isProperlyUpdated && !hasIterator) {
					if (staticAssignmentWarning) {
						context.addWarning(node.line, `⚠️ WAARSCHUWING: Mogelijke oneindige ${type}-loop! ${staticAssignmentWarning}`);
					} else {
						context.addWarning(node.line, `⚠️ WAARSCHUWING: Mogelijke oneindige ${type}-loop! Geen van de variabelen in de conditie wordt binnen de loop bijgewerkt.`);
					}
				}
			}
		}
	},

	analyzeIfStatements(nodes, context) {
		if (!Array.isArray(nodes)) return;
		for (let i = 0; i < nodes.length; i++) {
			const node = nodes[i];
			if (node.type === NodeTypes.IfStatement) {
				let thenNodes = [], elseNodes = [], inElse = false, depth = 1;
				for (let j = i + 1; j < nodes.length; j++) {
					const sub = nodes[j];
					if ([NodeTypes.WhileStatement, NodeTypes.RepeatStatement, NodeTypes.IfStatement].includes(sub.type)) depth++;
					if (sub.type === "Else" && depth === 1) { inElse = true; continue; }
					if (sub.type === "Done" || sub.type === "EndIf" || sub.isUntil) { depth--; if (depth === 0) break; }
					if (depth > 0) inElse ? elseNodes.push(sub) : thenNodes.push(sub);
				}

				if (inElse && thenNodes.length > 0 && thenNodes.length === elseNodes.length) {
					const strip = (n) => { const { line, ...rest } = n; return rest; };
					if (JSON.stringify(thenNodes.map(strip)) === JSON.stringify(elseNodes.map(strip))) {
						context.addWarning(node.line, `⚠️ Logica-waarschuwing: Code in THEN is identiek aan ELSE. Deze IF doet niets.`);
					}
				}
			}
		}
	}
};

module.exports = Validators;