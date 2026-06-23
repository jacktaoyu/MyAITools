/**
 * In-memory store for BMS AUTOSAR quality gate / MISRA reports.
 *
 * Reports are keyed by workspace directory. They are populated whenever a
 * generated BMS AUTOSAR artifact is written and validated, and consumed by the
 * webview Quality Report panel.
 */

export interface QualityReportIssue {
	severity: "error" | "warning" | "info"
	message: string
	line?: number
	rule?: string
	category?: "MISRA" | "ASIL" | "STRUCTURAL" | "COMPILE"
}

export interface QualityReportFile {
	filePath: string
	issues: QualityReportIssue[]
}

export interface QualityReport {
	cwd: string
	files: QualityReportFile[]
	summary: {
		errors: number
		warnings: number
		info: number
		total: number
	}
	updatedAt: string
}

const store = new Map<string, QualityReport>()

function makeKey(cwd: string): string {
	return cwd.toLowerCase()
}

export function getQualityReport(cwd: string): QualityReport | undefined {
	return store.get(makeKey(cwd))
}

export function clearQualityReport(cwd: string): void {
	store.delete(makeKey(cwd))
}

export function upsertQualityReportFile(cwd: string, filePath: string, issues: QualityReportIssue[]): QualityReport {
	const key = makeKey(cwd)
	const existing = store.get(key)
	const now = new Date().toISOString()

	let files: QualityReportFile[]
	if (existing) {
		files = existing.files.filter((f) => f.filePath.toLowerCase() !== filePath.toLowerCase())
		files.push({ filePath, issues })
	} else {
		files = [{ filePath, issues }]
	}

	files.sort((a, b) => a.filePath.localeCompare(b.filePath))

	const summary = files.reduce(
		(acc, file) => {
			for (const issue of file.issues) {
				if (issue.severity === "error") acc.errors++
				else if (issue.severity === "warning") acc.warnings++
				else if (issue.severity === "info") acc.info++
				acc.total++
			}
			return acc
		},
		{ errors: 0, warnings: 0, info: 0, total: 0 },
	)

	const report: QualityReport = { cwd, files, summary, updatedAt: now }
	store.set(key, report)
	return report
}

/**
 * Aggregate multiple single-file validation results into the workspace report.
 */
export function addQualityReportFiles(
	cwd: string,
	results: Array<{ filePath: string; issues: QualityReportIssue[] }>,
): QualityReport {
	for (const { filePath, issues } of results) {
		upsertQualityReportFile(cwd, filePath, issues)
	}
	return (
		store.get(makeKey(cwd)) ?? {
			cwd,
			files: [],
			summary: { errors: 0, warnings: 0, info: 0, total: 0 },
			updatedAt: new Date().toISOString(),
		}
	)
}
