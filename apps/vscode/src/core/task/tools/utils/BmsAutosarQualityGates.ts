import { execFile } from "node:child_process"
import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { promisify } from "node:util"
import { telemetryService } from "@/services/telemetry"
import { runMisraChecks } from "../handlers/bms-autosar/BmsAutosarMisraChecker"
import type { MisraIssue } from "../handlers/bms-autosar/BmsAutosarMisraChecker"
import { inferAsilLevel, runAsilSafetyChecks } from "../handlers/bms-autosar/BmsAutosarAsilSafetyChecker"
import type { AsilSafetyIssue } from "../handlers/bms-autosar/BmsAutosarAsilSafetyChecker"
import type { AsilLevel } from "../handlers/bms-autosar/BmsAutosarAsil"
import { upsertQualityReportFile } from "../handlers/bms-autosar/BmsAutosarQualityReportStore"
import type { QualityReportIssue } from "../handlers/bms-autosar/BmsAutosarQualityReportStore"
import { validateArxml, validateCHeader, validateCSource } from "./BmsAutosarValidationUtils"
import type { ValidationIssue, ValidationResult } from "./BmsAutosarValidationUtils"

const execFileAsync = promisify(execFile)

const MAX_QUALITY_GATE_SIZE_BYTES = 1024 * 1024 // 1 MB

/**
 * Safe, model-agnostic auto-fixes for BMS AUTOSAR generated artifacts.
 * These fixes never change semantics; they only correct formatting or
 * obvious structural omissions (include guards, EOF newline, etc.).
 */
export function fixAutosarContent(relPath: string, content: string): string {
	const ext = path.extname(relPath).toLowerCase()
	let fixed = content

	// Universal fixes
	fixed = fixed.replace(/[ \t]+$/gm, "") // trailing whitespace
	fixed = fixed.replace(/\r\n/g, "\n") // normalize line endings
	if (!fixed.endsWith("\n")) {
		fixed += "\n"
	}

	if (ext === ".h") {
		fixed = fixIncludeGuard(relPath, fixed)
	}

	return fixed
}

function fixIncludeGuard(relPath: string, content: string): string {
	const hasIfndef = /#ifndef\s+\w+/.test(content)
	const hasDefine = /#define\s+\w+/.test(content)
	const hasEndif = /#endif/.test(content)

	if (hasIfndef && hasDefine && hasEndif) {
		return content
	}

	const ext = path.extname(relPath)
	const base = path
		.basename(relPath, ext)
		.replace(/([a-z0-9])([A-Z])/g, "$1_$2")
		.replace(/[^A-Za-z0-9_]/g, "_")
		.toUpperCase()
	const guard = `${base}_H`

	const lines = content.split("\n")
	// Find first non-comment, non-empty line
	let insertIndex = 0
	for (let i = 0; i < lines.length; i++) {
		const trimmed = lines[i].trim()
		if (trimmed && !trimmed.startsWith("/*") && !trimmed.startsWith("*") && !trimmed.startsWith("//")) {
			insertIndex = i
			break
		}
	}

	const before = lines.slice(0, insertIndex)
	const after = lines.slice(insertIndex)

	return [
		...before,
		`#ifndef ${guard}`,
		`#define ${guard}`,
		"",
		...after,
		"",
		`#endif /* ${guard} */`,
		"",
	].join("\n")
}

/**
 * Find the opening tag that directly contains the character at `offset`.
 * Returns the tag name, or undefined if none is found.
 */
function findParentTag(xml: string, offset: number): string | undefined {
	const textBefore = xml.slice(0, offset)

	// Match both opening and closing tags in the text before offset.
	const tagRegex = /<(\/?)([A-Za-z_][\w:-]*)\b[^>]*?\/?>/g
	const tags: { tag: string; isOpen: boolean; index: number }[] = []
	let match: RegExpExecArray | null
	while ((match = tagRegex.exec(textBefore)) !== null) {
		const isOpen = match[1] !== "/"
		const tag = match[2]
		tags.push({ tag, isOpen, index: match.index })
	}

	// Scan backwards to find the nearest unclosed opening tag.
	const stack: string[] = []
	for (let i = tags.length - 1; i >= 0; i--) {
		const { tag, isOpen } = tags[i]
		if (isOpen) {
			if (stack.length > 0 && stack[stack.length - 1] === tag) {
				stack.pop()
			} else {
				return tag
			}
		} else {
			stack.push(tag)
		}
	}

	return undefined
}

/**
 * Enhanced ARXML validation beyond the lightweight checks in BmsAutosarValidationUtils:
 * - duplicate SHORT-NAME siblings
 * - dangling TREF references
 */
export function validateArxmlEnhanced(content: string): ValidationResult {
	const issues: ValidationIssue[] = []
	const trimmed = content.trim()

	if (trimmed.length === 0) {
		issues.push({ severity: "error", message: "ARXML file is empty." })
		return { issues }
	}

	// Find all SHORT-NAME elements grouped by parent tag.
	const parentShortNames = new Map<string, Set<string>>()
	const definedPaths = new Set<string>()
	const shortNameRegex = /<SHORT-NAME\b[^>]*>([^<]+)<\/SHORT-NAME>/g
	let match: RegExpExecArray | null
	while ((match = shortNameRegex.exec(trimmed)) !== null) {
		const shortName = match[1].trim()
		definedPaths.add(shortName)
		const parentTag = findParentTag(trimmed, match.index)
		if (!parentTag) continue
		if (!parentShortNames.has(parentTag)) {
			parentShortNames.set(parentTag, new Set())
		}
		const set = parentShortNames.get(parentTag)!
		if (set.has(shortName)) {
			issues.push({
				severity: "warning",
				message: `Duplicate <SHORT-NAME>${shortName}</SHORT-NAME> detected under <${parentTag}>.`,
			})
		}
		set.add(shortName)
	}

	const refRegex = /<(TYPE-TREF|DATA-TYPE-TREF|INTERFACE-TREF|REQUIRED-INTERFACE-TREF|PROVIDED-INTERFACE-TREF|COMPONENT-TREF|SOFTWARE-COMPOSITION-TREF|START-ON-EVENT-REF)\b[^>]*>([^<]*)<\/\1>/g
	const referencedPaths = new Map<string, string>()
	while ((match = refRegex.exec(trimmed)) !== null) {
		const tagName = match[1]
		const refPath = match[2].trim()
		if (refPath) {
			referencedPaths.set(refPath, tagName)
		}
	}

	for (const [refPath, tagName] of referencedPaths.entries()) {
		// References typically end with a SHORT-NAME segment; check that segment is defined somewhere.
		const segments = refPath.split("/").filter(Boolean)
		const targetName = segments[segments.length - 1]
		if (targetName && !definedPaths.has(targetName)) {
			issues.push({
				severity: "warning",
				message: `<${tagName}> references "${refPath}" but no element with SHORT-NAME "${targetName}" was found in this file.`,
			})
		}
	}

	const counts: Record<string, number> = {}
	for (const issue of issues) {
		counts[issue.severity] = (counts[issue.severity] ?? 0) + 1
	}
	telemetryService.captureBmsAutosarQualityGateIssues(counts)
	return { issues }
}

interface CompilerInfo {
	command: string
	args: string[]
}

async function findCompiler(): Promise<CompilerInfo | undefined> {
	for (const command of ["gcc", "clang"]) {
		try {
			await execFileAsync("which", [command])
			return { command, args: ["-fsyntax-only", "-std=c99"] }
		} catch {
			// Try next compiler
		}
	}
	return undefined
}

/**
 * Compile a C source snippet with an optional set of header contents.
 * Returns syntax/semantic errors from the compiler, or an info message if
 * no compiler is available.
 */
export async function compileCSmokeTest(
	relPath: string,
	content: string,
	headerContents?: Record<string, string>,
): Promise<ValidationResult> {
	if (content.length > MAX_QUALITY_GATE_SIZE_BYTES) {
		return { issues: [{ severity: "info", message: "File is larger than 1 MB; compile smoke test skipped." }] }
	}

	const compiler = await findCompiler()
	if (!compiler) {
		return {
			issues: [
				{
					severity: "info",
					message: "No C compiler (gcc/clang) found; compile smoke test skipped.",
				},
			],
		}
	}

	const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "bms-autosar-compile-"))
	const sourceName = path.basename(relPath)
	const sourcePath = path.join(tmpDir, sourceName)

	try {
		const includePaths: string[] = []

		if (headerContents) {
			for (const [headerName, headerContent] of Object.entries(headerContents)) {
				const headerPath = path.join(tmpDir, headerName)
				await fs.writeFile(headerPath, headerContent, "utf-8")
			}
			includePaths.push("-I", tmpDir)
		}

		await fs.writeFile(sourcePath, content, "utf-8")

		try {
			await execFileAsync(compiler.command, [...compiler.args, ...includePaths, sourcePath])
			return { issues: [] }
		} catch (error: any) {
			const stderr = error.stderr || error.stdout || error.message || ""
			const lines = String(stderr)
				.split("\n")
				.map((line) => line.trim())
				.filter((line) => line.length > 0 && !line.includes("^"))
				.slice(0, 10)

			return {
				issues: [
					{
						severity: "error",
						message: `Compile smoke test failed:\n${lines.join("\n")}`,
					},
				],
			}
		}
	} finally {
		await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {})
	}
}

export interface QualityGateOptions {
	/**
	 * Workspace directory. When provided, the validation result is stored in the
	 * BMS AUTOSAR quality report for the webview Quality Report panel.
	 */
	cwd?: string
	/**
	 * Target ASIL level for ASIL-aware checks. If omitted, the ASIL level is
	 * inferred from the file content when possible.
	 */
	asilLevel?: AsilLevel
}

/**
 * Run the full set of BMS AUTOSAR quality gates for a generated artifact.
 * Combines lightweight validation, enhanced structural checks, MISRA checks,
 * and (for .c files) an optional compiler smoke test.
 */
export async function runBmsAutosarQualityGates(
	relPath: string,
	content: string,
	options: QualityGateOptions = {},
): Promise<ValidationResult> {
	const ext = path.extname(relPath).toLowerCase()
	const issues: ValidationIssue[] = []

	if (content.length > MAX_QUALITY_GATE_SIZE_BYTES) {
		return { issues: [{ severity: "info", message: "File is larger than 1 MB; quality gates skipped." }] }
	}

	// Base validation
	if (ext === ".arxml") {
		issues.push(...validateArxml(content).issues)
		issues.push(...validateArxmlEnhanced(content).issues)
	} else if (ext === ".h") {
		const asilLevel = options.asilLevel ?? inferAsilLevelFromContent(content)
		issues.push(...addCategory(validateCHeader(content).issues, "STRUCTURAL"))
		issues.push(...mapMisraIssues(runMisraChecks(relPath, content, { asilLevel }).issues))
		issues.push(...mapAsilIssues(runAsilSafetyChecks(content, asilLevel)))
	} else if (ext === ".c") {
		const asilLevel = options.asilLevel ?? inferAsilLevelFromContent(content)
		issues.push(...addCategory(validateCSource(content).issues, "STRUCTURAL"))
		issues.push(...mapMisraIssues(runMisraChecks(relPath, content, { asilLevel }).issues))
		issues.push(...mapAsilIssues(runAsilSafetyChecks(content, asilLevel)))
		const compileResult = await compileCSmokeTest(relPath, content)
		issues.push(...addCategory(compileResult.issues, "COMPILE"))
	}

	if (options.cwd) {
		upsertQualityReportFile(
			options.cwd,
			relPath,
			issues.map((issue) => ({
				severity: issue.severity,
				message: issue.message,
				category: issue.category,
			})) as QualityReportIssue[],
		)
	}

	return { issues }
}

function mapMisraIssues(misraIssues: MisraIssue[]): ValidationIssue[] {
	return misraIssues.map((issue) => ({
		severity: issue.severity,
		message: `[MISRA ${issue.rule}] ${issue.message}${issue.line ? ` (line ${issue.line})` : ""}`,
		category: "MISRA" as const,
	}))
}

function mapAsilIssues(asilIssues: AsilSafetyIssue[]): ValidationIssue[] {
	return asilIssues.map((issue) => ({
		severity: issue.severity,
		message: `[ASIL ${issue.rule}] ${issue.message}${issue.line ? ` (line ${issue.line})` : ""}`,
		category: "ASIL" as const,
	}))
}

function addCategory(sourceIssues: ValidationIssue[], category: ValidationIssue["category"]): ValidationIssue[] {
	return sourceIssues.map((issue) => ({ ...issue, category: issue.category ?? category }))
}

function inferAsilLevelFromContent(content: string) {
	return inferAsilLevel(content, "QM")
}
