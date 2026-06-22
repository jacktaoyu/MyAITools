import path from "node:path"

export interface MisraRule {
	id: string
	category: "required" | "advisory" | "mandatory"
	description: string
}

export interface MisraIssue {
	rule: string
	category: MisraRule["category"]
	severity: "error" | "warning" | "info"
	line?: number
	message: string
}

export interface MisraCheckResult {
	filePath: string
	issues: MisraIssue[]
	summary: {
		errors: number
		warnings: number
		info: number
		total: number
	}
}

export interface MisraCheckOptions {
	/**
	 * Maximum length considered for external identifiers (MISRA C:2012 Rule 5.1).
	 * @default 31
	 */
	maxExternalIdentifierLength?: number
}

const MISRA_RULES: Record<string, MisraRule> = {
	"R5.1": { id: "R5.1", category: "required", description: "External identifiers shall be distinct." },
	"R7.1": { id: "R7.1", category: "required", description: "Octal constants shall not be used." },
	"R8.4": { id: "R8.4", category: "required", description: "A compatible declaration shall be visible for objects and functions with external linkage." },
	"R8.9": { id: "R8.9", category: "advisory", description: "An object should be defined at block scope if its identifier only appears in one function." },
	"R9.1": { id: "R9.1", category: "mandatory", description: "The value of an object with automatic storage shall not be read before it has been set." },
	"R11.3": { id: "R11.3", category: "required", description: "A cast shall not be performed between a pointer to object type and a pointer to a different object type." },
	"R14.4": { id: "R14.4", category: "required", description: "The controlling expression of an if or iteration statement shall have essentially Boolean type." },
	"R15.5": { id: "R15.5", category: "advisory", description: "A function should have a single point of exit at the end of the function." },
	"R17.7": { id: "R17.7", category: "required", description: "The value returned by a function having non-void return type shall be used." },
	"R21.3": { id: "R21.3", category: "required", description: "The memory allocation and deallocation functions of <stdlib.h> shall not be used." },
	"R21.6": { id: "R21.6", category: "required", description: "The Standard Library input/output functions shall not be used." },
	"R21.8": { id: "R21.8", category: "required", description: "The library functions abort, exit, getenv and system of <stdlib.h> shall not be used." },
	"R21.9": { id: "R21.9", category: "required", description: "The library functions bsearch and qsort of <stdlib.h> shall not be used." },
}

function stripCComments(content: string): string {
	return content.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/.*$/gm, " ")
}

function countLinesBefore(content: string, offset: number): number {
	return content.slice(0, offset).split("\n").length
}

function ruleSeverity(category: MisraRule["category"]): "error" | "warning" | "info" {
	switch (category) {
		case "mandatory":
			return "error"
		case "required":
			return "error"
		case "advisory":
			return "warning"
	}
}

/**
 * Run MISRA C:2012 inspired static checks on a C source or header file.
 *
 * This is intentionally lightweight (regex-based) and designed to catch the
 * most common generated-code violations without requiring a full compiler
 * frontend. It is not a replacement for a certified MISRA checker.
 */
export function runMisraChecks(filePath: string, content: string, options: MisraCheckOptions = {}): MisraCheckResult {
	const stripped = stripCComments(content)
	const lines = content.split("\n")
	const issues: MisraIssue[] = []
	const ext = path.extname(filePath).toLowerCase()
	const isHeader = ext === ".h"

	const maxExternalIdLen = options.maxExternalIdentifierLength ?? 31

	// R21.3 / R21.8 / R21.9: forbidden stdlib functions.
	const forbiddenStdlib = new Map<string, string>([
		["malloc", "R21.3"],
		["free", "R21.3"],
		["calloc", "R21.3"],
		["realloc", "R21.3"],
		["abort", "R21.8"],
		["exit", "R21.8"],
		["getenv", "R21.8"],
		["system", "R21.8"],
		["bsearch", "R21.9"],
		["qsort", "R21.9"],
	])
	const stdlibCallRegex = new RegExp(`\\b(${Array.from(forbiddenStdlib.keys()).join("|")})\\s*\\(`, "g")
	let match: RegExpExecArray | null
	while ((match = stdlibCallRegex.exec(stripped)) !== null) {
		const func = match[1]
		const rule = forbiddenStdlib.get(func)!
		issues.push({
			rule,
			category: MISRA_RULES[rule].category,
			severity: ruleSeverity(MISRA_RULES[rule].category),
			line: countLinesBefore(stripped, match.index),
			message: `Use of forbidden <stdlib.h> function "${func}()" is not allowed in MISRA C code.`,
		})
	}

	// R21.6: stdio functions.
	const stdioRegex = /\b(printf|fprintf|sprintf|snprintf|scanf|fscanf|sscanf|fopen|fclose|fread|fwrite|fgets|fputs|puts|gets|putchar|getchar)\s*\(/g
	while ((match = stdioRegex.exec(stripped)) !== null) {
		const func = match[1]
		issues.push({
			rule: "R21.6",
			category: MISRA_RULES["R21.6"].category,
			severity: ruleSeverity(MISRA_RULES["R21.6"].category),
			line: countLinesBefore(stripped, match.index),
			message: `Use of forbidden <stdio.h> function "${func}()" is not allowed in MISRA C code.`,
		})
	}

	// R7.1: no octal constants (0-prefixed numbers that are not 0x hex).
	const octalRegex = /(?<![\w.])0([0-7]+)(?![\w.xX])/g
	while ((match = octalRegex.exec(stripped)) !== null) {
		issues.push({
			rule: "R7.1",
			category: MISRA_RULES["R7.1"].category,
			severity: ruleSeverity(MISRA_RULES["R7.1"].category),
			line: countLinesBefore(stripped, match.index),
			message: `Octal constant "0${match[1]}" is not allowed; use explicit decimal or hex form.`,
		})
	}

	// R11.3: suspicious pointer casts (heuristic).
	const castRegex = /\(\s*(uint8|uint16|uint32|sint8|sint16|sint32|float32|boolean|void)\s*\*\s*\)/g
	while ((match = castRegex.exec(stripped)) !== null) {
		issues.push({
			rule: "R11.3",
			category: MISRA_RULES["R11.3"].category,
			severity: "warning",
			line: countLinesBefore(stripped, match.index),
			message: `Suspicious pointer cast to "${match[1]} *"; verify it does not violate MISRA Rule 11.3.`,
		})
	}

	// R14.4: controlling expressions should be Boolean.
	// Heuristic: assignments inside if/while/for conditions.
	const controlAssignRegex = /\b(if|while|for)\s*\([^)]*=[^=][^)]*\)/g
	while ((match = controlAssignRegex.exec(stripped)) !== null) {
		issues.push({
			rule: "R14.4",
			category: MISRA_RULES["R14.4"].category,
			severity: ruleSeverity(MISRA_RULES["R14.4"].category),
			line: countLinesBefore(stripped, match.index),
			message: `Potential assignment used as controlling expression in ${match[1]} statement.`,
		})
	}

	// R15.5: multiple return statements.
	const functionBlocks = findFunctionBodies(stripped)
	for (const { name, body, startOffset } of functionBlocks) {
		const returnCount = (body.match(/\breturn\b/g) || []).length
		if (returnCount > 1) {
			issues.push({
				rule: "R15.5",
				category: MISRA_RULES["R15.5"].category,
				severity: ruleSeverity(MISRA_RULES["R15.5"].category),
				line: countLinesBefore(stripped, startOffset),
				message: `Function "${name}" contains ${returnCount} return statements; MISRA recommends a single exit point.`,
			})
		}
	}

	// R17.7: unused non-void return values.
	const ignoredReturnRegex = /(?:^|;|\{)\s*([A-Za-z_][A-Za-z0-9_]*)\s*\([^;)]*\)\s*;/gm
	while ((match = ignoredReturnRegex.exec(stripped)) !== null) {
		const func = match[1]
		// Skip known void-like or standard functions.
		if (func.startsWith("Rte_") || func.startsWith("Det_") || func.startsWith("SchM_")) {
			continue
		}
		// Heuristic: treat PascalCase_Module_Function calls as potentially returning a status.
		if (/^[A-Z][a-zA-Z0-9]*_[A-Za-z0-9_]+$/.test(func)) {
			issues.push({
				rule: "R17.7",
				category: MISRA_RULES["R17.7"].category,
				severity: "info",
				line: countLinesBefore(stripped, match.index),
				message: `Return value of "${func}()" may be unused; verify it is intentionally discarded.`,
			})
		}
	}

	// R5.1: external identifier length.
	const externalIds = new Set<string>()
	const globalRegex = /(?:^|\n)\s*(?:extern\s+)?[A-Za-z_][A-Za-z0-9_]*\s+\*?\s*([A-Za-z_][A-Za-z0-9_]*)\s*\([^)]*\)\s*[;{]/gm
	while ((match = globalRegex.exec(stripped)) !== null) {
		externalIds.add(match[1])
	}
	for (const id of externalIds) {
		if (id.length > maxExternalIdLen) {
			issues.push({
				rule: "R5.1",
				category: MISRA_RULES["R5.1"].category,
				severity: ruleSeverity(MISRA_RULES["R5.1"].category),
				message: `External identifier "${id}" (${id.length} chars) exceeds the ${maxExternalIdLen}-character portability limit.`,
			})
		}
	}

	// R8.4: definition without prior declaration for non-static functions.
	const definitionRegex = /(?:^|\n)\s*(?!\s*static\b)(?:extern\s+)?[A-Za-z_][A-Za-z0-9_]*\s+\*?\s*([A-Za-z_][A-Za-z0-9_]*)\s*\([^)]*\)\s*\{/g
	const declared = new Set<string>()
	const defined = new Set<string>()
	const declRegex = /(?:^|\n)\s*(?:extern\s+)?[A-Za-z_][A-Za-z0-9_]*\s+\*?\s*([A-Za-z_][A-Za-z0-9_]*)\s*\([^)]*\)\s*;/g
	while ((match = declRegex.exec(stripped)) !== null) {
		declared.add(match[1])
	}
	while ((match = definitionRegex.exec(stripped)) !== null) {
		defined.add(match[1])
	}
	for (const fn of defined) {
		if (!declared.has(fn) && !isHeader && fn !== "main") {
			issues.push({
				rule: "R8.4",
				category: MISRA_RULES["R8.4"].category,
				severity: ruleSeverity(MISRA_RULES["R8.4"].category),
				message: `Function "${fn}" is defined without a visible declaration.`,
			})
		}
	}

	// R9.1: uninitialized locals (existing heuristic, moved here with rule mapping).
	const uninitialized = findUninitializedVariables(stripped)
	for (const variable of uninitialized.slice(0, 10)) {
		issues.push({
			rule: "R9.1",
			category: MISRA_RULES["R9.1"].category,
			severity: ruleSeverity(MISRA_RULES["R9.1"].category),
			message: `Potentially uninitialized local variable: ${variable}.`,
		})
	}

	const summary = {
		errors: issues.filter((i) => i.severity === "error").length,
		warnings: issues.filter((i) => i.severity === "warning").length,
		info: issues.filter((i) => i.severity === "info").length,
		total: issues.length,
	}

	return { filePath, issues, summary }
}

function findFunctionBodies(content: string): Array<{ name: string; body: string; startOffset: number }> {
	const bodies: Array<{ name: string; body: string; startOffset: number }> = []
	const regex = /\b([A-Za-z_][A-Za-z0-9_]*)\s*\([^)]*\)\s*\{/g
	let match: RegExpExecArray | null
	while ((match = regex.exec(content)) !== null) {
		const start = match.index + match[0].length
		const name = match[1]
		let depth = 1
		let i = start
		while (i < content.length && depth > 0) {
			if (content[i] === "{") depth++
			else if (content[i] === "}") depth--
			i++
		}
		bodies.push({ name, body: content.slice(start, i - 1), startOffset: match.index })
	}
	return bodies
}

function findUninitializedVariables(content: string): string[] {
	const uninitialized: string[] = []
	const regex = /\b(?:uint8|uint16|uint32|uint64|sint8|sint16|sint32|sint64|float32|float64|boolean|int|char|unsigned|signed)\b\s+\*?\s*([A-Za-z_][\w,\s]*)(?!\s*=)/g
	let match: RegExpExecArray | null
	while ((match = regex.exec(content)) !== null) {
		const decl = match[1]
		const vars = decl
			.split(",")
			.map((v) => v.trim())
			.filter((v) => v && /^[A-Za-z_]/.test(v))
		uninitialized.push(...vars)
	}
	return Array.from(new Set(uninitialized))
}

/**
 * Format a single-file MISRA result as a markdown report suitable for appending
 * to a tool result or progress event.
 */
export function formatMisraReport(result: MisraCheckResult): string {
	if (result.issues.length === 0) {
		return `\n\n[MISRA check for ${path.basename(result.filePath)}] ✅ No MISRA-style issues detected.`
	}

	const { errors, warnings, info, total } = result.summary
	const header = `\n\n[MISRA check for ${path.basename(result.filePath)}] ${errors} error(s), ${warnings} warning(s), ${info} info note(s) (${total} total)`
	const lines = result.issues.map((issue) => {
		const icon = issue.severity === "error" ? "❌" : issue.severity === "warning" ? "⚠️" : "ℹ️"
		const linePart = issue.line ? ` (line ${issue.line})` : ""
		return `${icon} [${issue.rule}]${linePart} ${issue.message}`
	})
	return [header, ...lines].join("\n")
}

/**
 * Aggregate multiple single-file MISRA results into one summary report.
 */
export function formatMisraSummary(results: MisraCheckResult[]): string {
	const totalErrors = results.reduce((sum, r) => sum + r.summary.errors, 0)
	const totalWarnings = results.reduce((sum, r) => sum + r.summary.warnings, 0)
	const totalInfo = results.reduce((sum, r) => sum + r.summary.info, 0)
	const totalIssues = results.reduce((sum, r) => sum + r.summary.total, 0)

	if (totalIssues === 0) {
		return "\n\n[MISRA summary] ✅ All checked files passed MISRA-style static analysis."
	}

	return `\n\n[MISRA summary] Checked ${results.length} file(s): ${totalErrors} error(s), ${totalWarnings} warning(s), ${totalInfo} info note(s).`
}
