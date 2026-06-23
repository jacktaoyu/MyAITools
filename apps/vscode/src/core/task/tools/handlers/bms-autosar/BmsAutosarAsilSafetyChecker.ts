import { type AsilLevel, isHighAsil, normalizeAsilLevel } from "./BmsAutosarAsil"

export interface AsilSafetyIssue {
	rule: string
	severity: "error" | "warning" | "info"
	line?: number
	message: string
	category: "ASIL"
}

const ASIL_LEVEL_COMMENT_REGEX = /\\ASIL\s+level:\s*(QM|ASIL[_\s-][ABCD])/i

/**
 * Infer the ASIL level from a generated file's Doxygen /ASIL level tag.
 * Falls back to the provided default when no tag is found.
 */
export function inferAsilLevel(content: string, fallback: AsilLevel = "QM"): AsilLevel {
	const match = ASIL_LEVEL_COMMENT_REGEX.exec(content)
	if (!match) {
		return fallback
	}
	return normalizeAsilLevel(match[1])
}

function countLinesBefore(content: string, offset: number): number {
	return content.slice(0, offset).split("\n").length
}

function stripCComments(content: string): string {
	return content.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/.*$/gm, " ")
}

function findFunctionBodies(content: string): Array<{ name: string; body: string; startOffset: number }> {
	const bodies: Array<{ name: string; body: string; startOffset: number }> = []
	const regex = /\b([A-Za-z_][A-Za-z0-9_]*)\s*\([^)]*\)\s*\{/g
	for (const match of content.matchAll(regex)) {
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

/**
 * Run ASIL-specific safety checks on a C source or header file.
 *
 * These checks are intentionally heuristic. They are meant to remind developers
 * of common safety patterns for high ASIL levels, not to replace a certified
 * safety analysis tool.
 */
export function runAsilSafetyChecks(content: string, asilLevel?: AsilLevel): AsilSafetyIssue[] {
	const level = asilLevel ?? inferAsilLevel(content, "QM")
	if (!isHighAsil(level)) {
		return []
	}

	const stripped = stripCComments(content)
	const issues: AsilSafetyIssue[] = []
	const lower = stripped.toLowerCase()

	// SAFETY-WDGM: high ASIL files should reference the watchdog manager.
	if (!/\bWdgM_\w+\b/i.test(stripped) && !lower.includes("wdgm")) {
		issues.push({
			rule: "SAFETY-WDGM",
			severity: "warning",
			message: "No WdgM (watchdog manager) references found; safety-critical runnables should include WdgM checkpoints.",
			category: "ASIL",
		})
	}

	// SAFETY-E2E: high ASIL files should mention E2E protection.
	if (!/\bE2E_\w+\b/i.test(stripped) && !lower.includes("e2e")) {
		issues.push({
			rule: "SAFETY-E2E",
			severity: "warning",
			message: "No E2E protection references found; consider E2E for data communicated across safety boundaries.",
			category: "ASIL",
		})
	}

	// SAFETY-DET: high ASIL files should use the Default Error Tracer for faults.
	if (!/\bDet_\w+\b/i.test(stripped) && !lower.includes("det")) {
		issues.push({
			rule: "SAFETY-DET",
			severity: "warning",
			message: "No DET (Default Error Tracer) references found; report safety-relevant failures via Det_ReportError.",
			category: "ASIL",
		})
	}

	// SAFETY-RANGE: heuristic check for range/bounds validation in function bodies.
	const functionBlocks = findFunctionBodies(stripped)
	let hasRangeCheck = false
	for (const { body } of functionBlocks) {
		// Look for comparisons that could indicate input/output validation.
		if (/\bif\s*\([^)]*(<|>|<=|>=|==|!=)[^)]*\)/.test(body)) {
			hasRangeCheck = true
			break
		}
	}
	if (!hasRangeCheck && functionBlocks.length > 0) {
		issues.push({
			rule: "SAFETY-RANGE",
			severity: "warning",
			message: "No obvious range/validation checks found in function bodies; safety-critical inputs should be validated.",
			category: "ASIL",
		})
	}

	// SAFETY-EXIT: high ASIL functions should have a single exit point.
	for (const { name, body, startOffset } of functionBlocks) {
		const returnCount = (body.match(/\breturn\b/g) || []).length
		if (returnCount > 1) {
			issues.push({
				rule: "SAFETY-EXIT",
				severity: "error",
				line: countLinesBefore(stripped, startOffset),
				message: `Safety-relevant function "${name}" contains ${returnCount} return statements; a single exit point is required.`,
				category: "ASIL",
			})
		}
	}

	return issues
}
