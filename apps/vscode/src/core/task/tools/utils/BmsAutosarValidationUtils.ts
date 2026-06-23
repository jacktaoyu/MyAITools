import path from "node:path"

export interface ValidationIssue {
	severity: "error" | "warning" | "info"
	message: string
	category?: "MISRA" | "ASIL" | "STRUCTURAL" | "COMPILE"
}

export interface ValidationResult {
	issues: ValidationIssue[]
}

const MAX_VALIDATION_SIZE_BYTES = 1024 * 1024 // 1 MB

/**
 * Decide whether a file is candidate for BMS AUTOSAR validation.
 * - All .arxml files are validated.
 * - .c/.h files are validated only when their name/path suggests they were
 *   generated for a BMS AUTOSAR component.
 */
export function shouldValidateAutosarFile(relPath: string): boolean {
	const lower = relPath.toLowerCase()
	const ext = path.extname(lower)

	if (ext === ".arxml") {
		return true
	}

	if (ext === ".c" || ext === ".h") {
		const base = path.basename(lower, ext)
		const dir = path.dirname(lower)
		const text = `${dir}/${base}`
		// Match names like BmsCellMonitor.c, BmsDiagnostic_Cfg.h, or paths containing bms/autosar.
		return (
			/^bms[A-Z]/i.test(base) ||
			base.includes("bms_") ||
			base.includes("autosar") ||
			text.includes("/bms/") ||
			text.includes("/autosar/")
		)
	}

	return false
}

/**
 * Validate a BMS AUTOSAR artifact based on its extension.
 */
export function validateAutosarFile(relPath: string, content: string): ValidationResult {
	if (content.length > MAX_VALIDATION_SIZE_BYTES) {
		return { issues: [{ severity: "info", message: "File is larger than 1 MB; validation skipped." }] }
	}

	try {
		const ext = path.extname(relPath).toLowerCase()
		if (ext === ".arxml") {
			return validateArxml(content)
		}
		if (ext === ".h") {
			return validateCHeader(content)
		}
		if (ext === ".c") {
			return validateCSource(content)
		}
		return { issues: [] }
	} catch (error) {
		return {
			issues: [
				{
					severity: "info",
					message: `Validation could not run: ${error instanceof Error ? error.message : String(error)}`,
				},
			],
		}
	}
}

/**
 * Lightweight structural validation for AUTOSAR ARXML.
 */
export function validateArxml(content: string): ValidationResult {
	const issues: ValidationIssue[] = []
	const trimmed = content.trim()

	if (trimmed.length === 0) {
		issues.push({ severity: "error", message: "ARXML file is empty." })
		return { issues }
	}

	if (!trimmed.startsWith("<?xml") && !trimmed.startsWith("<")) {
		issues.push({ severity: "error", message: "File does not start with an XML declaration or element." })
	}

	if (!/<AUTOSAR\b/.test(trimmed)) {
		issues.push({ severity: "error", message: "Root element is not <AUTOSAR>." })
	}

	const hasRecognizedContent =
		/<APPLICATION-SW-COMPONENT-TYPE\b/.test(trimmed) ||
		/<SERVICE-SW-COMPONENT-TYPE\b/.test(trimmed) ||
		/<COMPOSITION-SW-COMPONENT-TYPE\b/.test(trimmed) ||
		/<BSW-MODULE-DESCRIPTION\b/.test(trimmed) ||
		/<AR-PACKAGE\b/.test(trimmed) ||
		/<SHORT-NAME\b/.test(trimmed)
	if (!hasRecognizedContent) {
		issues.push({
			severity: "warning",
			message:
				"No recognized AUTOSAR content found (expected AR-PACKAGE, APPLICATION-SW-COMPONENT-TYPE, SERVICE-SW-COMPONENT-TYPE, COMPOSITION-SW-COMPONENT-TYPE, or BSW-MODULE-DESCRIPTION).",
		})
	}

	if (!/<SHORT-NAME\b/.test(trimmed)) {
		issues.push({ severity: "warning", message: "No <SHORT-NAME> element found; every AUTOSAR element should have a SHORT-NAME." })
	}

	// Basic tag-balance check.
	const balance = checkXmlTagBalance(trimmed)
	if (balance.error) {
		issues.push({ severity: "error", message: balance.error })
	}

	// Check for common AUTOSAR reference issues.
	const refIssues = checkArxmlReferences(trimmed)
	issues.push(...refIssues)

	return { issues }
}

/**
 * Validate AUTOSAR reference attributes.
 * - Reports TYPE-TREF / DATA-TYPE-TREF without a DEST attribute.
 * - Reports references to empty paths.
 * - Reports mismatched DEST values for common reference types.
 */
function checkArxmlReferences(xml: string): ValidationIssue[] {
	const issues: ValidationIssue[] = []
	const refRegex = /<(TYPE-TREF|DATA-TYPE-TREF|INTERFACE-TREF|REQUIRED-INTERFACE-TREF|PROVIDED-INTERFACE-TREF|COMPONENT-TREF|SOFTWARE-COMPOSITION-TREF|START-ON-EVENT-REF)\b([^>]*)>([^<]*)<\/\1>/g

	let match: RegExpExecArray | null
	while ((match = refRegex.exec(xml)) !== null) {
		const tagName = match[1]
		const attrs = match[2]
		const refPath = match[3].trim()

		if (!refPath) {
			issues.push({ severity: "error", message: `<${tagName}> has an empty reference path.` })
		}

		if (!/\bDEST\s*=\s*"/.test(attrs)) {
			issues.push({ severity: "warning", message: `<${tagName}> is missing the DEST attribute.` })
		} else {
			const destMatch = /DEST\s*=\s*"([^"]*)"/.exec(attrs)
			const dest = destMatch ? destMatch[1] : ""
			const expectedDest = getExpectedDestForRefTag(tagName)
			if (expectedDest && dest !== expectedDest) {
				issues.push({
					severity: "warning",
					message: `<${tagName}> DEST="${dest}" does not match the expected "${expectedDest}".`,
				})
			}
		}
	}

	return issues
}

function getExpectedDestForRefTag(tagName: string): string | undefined {
	switch (tagName) {
		case "TYPE-TREF":
		case "DATA-TYPE-TREF":
			return "IMPLEMENTATION-DATA-TYPE"
		case "INTERFACE-TREF":
		case "REQUIRED-INTERFACE-TREF":
		case "PROVIDED-INTERFACE-TREF":
			return "SENDER-RECEIVER-INTERFACE"
		case "START-ON-EVENT-REF":
			return "RUNNABLE-ENTITY"
		case "COMPONENT-TREF":
			return "APPLICATION-SW-COMPONENT-TYPE"
		case "SOFTWARE-COMPOSITION-TREF":
			return "COMPOSITION-SW-COMPONENT-TYPE"
		default:
			return undefined
	}
}

/**
 * Simple stack-based XML tag balance check.
 * Ignores comments, CDATA sections, and self-closing tags.
 */
function checkXmlTagBalance(xml: string): { error?: string } {
	// Remove XML comments.
	let cleaned = xml.replace(/<!--[\s\S]*?-->/g, "")
	// Remove CDATA sections (we only care about tag balance, not their content).
	cleaned = cleaned.replace(/<!\[CDATA\[[\s\S]*?\]\]>/g, "")

	const tagRegex = /<(\/?)([A-Za-z_][\w:-]*)\b[^>]*?(\/?)>/g
	const stack: string[] = []

	let match: RegExpExecArray | null
	while ((match = tagRegex.exec(cleaned)) !== null) {
		const isClose = match[1] === "/"
		const tagName = match[2]
		const isSelfClosing = match[3] === "/"

		if (isSelfClosing) {
			continue
		}

		if (isClose) {
			const expected = stack.pop()
			if (!expected) {
				return { error: `Unexpected closing tag </${tagName}>.` }
			}
			if (expected !== tagName) {
				return { error: `Mismatched tags: opened <${expected}> but closed </${tagName}>.` }
			}
		} else {
			stack.push(tagName)
		}
	}

	if (stack.length > 0) {
		return { error: `Unclosed tag(s): ${stack.join(", ")}.` }
	}

	return {}
}

/**
 * Validate a C source file for common AUTOSAR/MISRA style issues.
 */
export function validateCSource(content: string): ValidationResult {
	const issues: ValidationIssue[] = []

	// TODO markers are informational and should be detected before stripping comments.
	if (/\bTODO\b/.test(content)) {
		issues.push({ severity: "info", message: "TODO markers remain in the generated code." })
	}

	const stripped = stripCComments(content)

	// MISRA C:2012 Rule 21.3 - dynamic memory allocation shall not be used.
	if (/\bmalloc\b/.test(stripped)) {
		issues.push({ severity: "error", message: "Use of malloc() is not allowed in AUTOSAR/MISRA C code." })
	}
	if (/\bfree\b/.test(stripped)) {
		issues.push({ severity: "error", message: "Use of free() is not allowed in AUTOSAR/MISRA C code." })
	}
	if (/\bcalloc\b/.test(stripped)) {
		issues.push({ severity: "error", message: "Use of calloc() is not allowed in AUTOSAR/MISRA C code." })
	}
	if (/\brealloc\b/.test(stripped)) {
		issues.push({ severity: "error", message: "Use of realloc() is not allowed in AUTOSAR/MISRA C code." })
	}

	// goto is discouraged.
	if (/\bgoto\b/.test(stripped)) {
		issues.push({ severity: "warning", message: "Use of goto() should be avoided in AUTOSAR/MISRA C code." })
	}

	// Expect at least one function definition or declaration.
	if (!/\b\w+\s+\*?\s*\w+\s*\([^)]*\)\s*(;|\{)/.test(stripped)) {
		issues.push({ severity: "warning", message: "No function declaration or definition found." })
	}

	// Flag potential magic numbers in function bodies (excluding 0, 1, and common patterns).
	const magicNumbers = findMagicNumbers(stripped)
	if (magicNumbers.length > 0) {
		issues.push({
			severity: "info",
			message: `Potential magic numbers detected: ${magicNumbers.slice(0, 5).join(", ")}${magicNumbers.length > 5 ? "..." : ""}. Consider using named constants.`,
		})
	}

	// Flag uninitialized local variables.
	const uninitializedVars = findUninitializedVariables(stripped)
	if (uninitializedVars.length > 0) {
		issues.push({
			severity: "warning",
			message: `Potentially uninitialized local variables: ${uninitializedVars.slice(0, 5).join(", ")}${uninitializedVars.length > 5 ? "..." : ""}.`,
		})
	}

	// Check function naming convention: ModuleName_FunctionName.
	const namingIssues = findNamingConventionIssues(stripped)
	for (const fn of namingIssues.slice(0, 3)) {
		issues.push({ severity: "info", message: `Function "${fn}" does not follow PascalCase_ModuleName_FunctionName convention.` })
	}

	// TODO markers are informational.
	if (/\bTODO\b/.test(stripped)) {
		issues.push({ severity: "info", message: "TODO markers remain in the generated code." })
	}

	return { issues }
}

/**
 * Find standalone numeric literals that look like magic numbers.
 * Ignores 0, 1, values inside #define/array sizes, and hex constants used as masks.
 */
function findMagicNumbers(content: string): string[] {
	const numbers = new Set<string>()
	// Match decimal/hex numbers that are not part of identifiers or preprocessor directives.
	const regex = /(?<![\w#.\/])(-?\d+|-?0x[0-9A-Fa-f]+)(?![\w.])/g
	const lines = content.split("\n")

	for (const line of lines) {
		const trimmed = line.trim()
		// Skip preprocessor directives and array declarations.
		if (trimmed.startsWith("#define") || trimmed.startsWith("#include") || /^\s*static\s+const\s/.test(trimmed)) {
			continue
		}

		let match: RegExpExecArray | null
		while ((match = regex.exec(line)) !== null) {
			const value = match[1]
			const numericValue = Number.parseInt(value, value.startsWith("0x") ? 16 : 10)
			// Allow 0, 1, and common sentinel values.
			if (numericValue !== 0 && numericValue !== 1) {
				numbers.add(value)
			}
		}
	}

	return Array.from(numbers)
}

/**
 * Find local variable declarations that are not initialized at the point of declaration.
 */
function findUninitializedVariables(content: string): string[] {
	const uninitialized: string[] = []
	// Match common auto variable declarations like "uint8 x;" or "uint16 x, y;" but not "uint8 x = 0;".
	const regex = /\b(?:uint8|uint16|uint32|sint8|sint16|sint32|float32|boolean|int|char)\b\s+([A-Za-z_][\w,\s]*)(?!\s*=)/g

	let match: RegExpExecArray | null
	while ((match = regex.exec(content)) !== null) {
		const decl = match[1]
		// Split multiple variables and filter out empty entries.
		const vars = decl
			.split(",")
			.map((v) => v.trim())
			.filter((v) => v && /^[A-Za-z_]/.test(v))
		uninitialized.push(...vars)
	}

	return uninitialized
}

/**
 * Find function names that do not appear to follow ModuleName_FunctionName convention.
 * Allows standard library functions and AUTOSAR RTE/DET prefixes.
 */
function findNamingConventionIssues(content: string): string[] {
	const issues: string[] = []
	const funcRegex = /\b([A-Za-z_][A-Za-z0-9_]*)\s*\([^)]*\)\s*\{/g

	let match: RegExpExecArray | null
	while ((match = funcRegex.exec(content)) !== null) {
		const name = match[1]
		// Skip RTE APIs, DET, SchM, and common AUTOSAR functions.
		if (
			name.startsWith("Rte_") ||
			name.startsWith("Det_") ||
			name.startsWith("SchM_") ||
			name.startsWith("Dem_") ||
			name.startsWith("Dcm_") ||
			name === "main"
		) {
			continue
		}
		// Expect PascalCase module prefix separated by underscore from function name.
		if (!/^[A-Z][a-zA-Z0-9]*_[A-Z]/.test(name)) {
			issues.push(name)
		}
	}

	return issues
}

/**
 * Validate a C header file for common AUTOSAR/MISRA style issues.
 */
export function validateCHeader(content: string): ValidationResult {
	const issues: ValidationIssue[] = []

	if (/\bTODO\b/.test(content)) {
		issues.push({ severity: "info", message: "TODO markers remain in the generated header." })
	}

	const stripped = stripCComments(content)

	// Headers should have an include guard.
	const hasIfndef = /#ifndef\s+\w+/.test(stripped)
	const hasDefine = /#define\s+\w+/.test(stripped)
	const hasEndif = /#endif/.test(stripped)
	if (!hasIfndef || !hasDefine || !hasEndif) {
		issues.push({ severity: "warning", message: "Header file is missing a complete include guard (#ifndef/#define/#endif)." })
	}

	// MISRA C:2012 Rule 21.3.
	if (/\bmalloc\b/.test(stripped) || /\bfree\b/.test(stripped) || /\bcalloc\b/.test(stripped) || /\brealloc\b/.test(stripped)) {
		issues.push({ severity: "error", message: "Dynamic memory allocation functions are not allowed in AUTOSAR/MISRA C headers." })
	}

	// goto is discouraged.
	if (/\bgoto\b/.test(stripped)) {
		issues.push({ severity: "warning", message: "Use of goto() should be avoided in AUTOSAR/MISRA C code." })
	}

	if (/\bTODO\b/.test(stripped)) {
		issues.push({ severity: "info", message: "TODO markers remain in the generated header." })
	}

	return { issues }
}

/**
 * Strip C/C++ comments so they do not interfere with keyword checks.
 */
function stripCComments(content: string): string {
	return content
		.replace(/\/\*[\s\S]*?\*\//g, " ")
		.replace(/\/\/.*$/gm, " ")
}

/**
 * Format validation findings as a markdown block suitable for appending to a tool result.
 * Returns an empty string when there are no findings.
 */
export function formatValidationReport(relPath: string, result: ValidationResult): string {
	if (result.issues.length === 0) {
		return ""
	}

	const icon = (severity: ValidationIssue["severity"]) => {
		switch (severity) {
			case "error":
				return "❌"
			case "warning":
				return "⚠️"
			case "info":
				return "ℹ️"
		}
	}

	const lines = result.issues.map((issue) => `${icon(issue.severity)} ${issue.message}`)
	return `\n\n[BMS AUTOSAR validation for ${path.basename(relPath)}]\n${lines.join("\n")}`
}
