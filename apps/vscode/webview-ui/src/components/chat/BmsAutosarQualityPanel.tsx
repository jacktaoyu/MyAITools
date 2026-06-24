import { VSCodeButton } from "@vscode/webview-ui-toolkit/react"
import React, { useCallback, useEffect, useState } from "react"
import {
	AutoFixBmsAutosarFileRequest,
	AutoFixBmsAutosarFileResponse,
	BmsAutosarQualityIssue,
	BmsAutosarQualityReport,
	BmsAutosarQualityReportFile,
	BmsAutosarQualityReportRequest,
} from "@shared/proto/cline/file"
import { StringRequest } from "@shared/proto/cline/common"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { FileServiceClient } from "@/services/grpc-client"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"

type Severity = "error" | "warning" | "info"
type Category = "MISRA" | "ASIL" | "STRUCTURAL" | "COMPILE"

const severityOrder: Severity[] = ["error", "warning", "info"]
const categories: Category[] = ["MISRA", "ASIL", "STRUCTURAL", "COMPILE"]

const severityIcon = (severity: Severity) => {
	switch (severity) {
		case "error":
			return "❌"
		case "warning":
			return "⚠️"
		case "info":
			return "ℹ️"
	}
}

const severityClass = (severity: Severity) => {
	switch (severity) {
		case "error":
			return "text-[var(--vscode-errorForeground)]"
		case "warning":
			return "text-[var(--vscode-editorWarning-foreground)]"
		case "info":
			return "text-[var(--vscode-descriptionForeground)]"
	}
}

export const BmsAutosarQualityPanel: React.FC = () => {
	const [isOpen, setIsOpen] = useState(false)
	const [report, setReport] = useState<BmsAutosarQualityReport | null>(null)
	const [loading, setLoading] = useState(false)
	const [fixingFile, setFixingFile] = useState<string | null>(null)
	const [selectedSeverity, setSelectedSeverity] = useState<Severity | "all">("all")
	const [selectedCategory, setSelectedCategory] = useState<Category | "all">("all")
	const [preview, setPreview] = useState<AutoFixBmsAutosarFileResponse | null>(null)

	const fetchReport = useCallback(async () => {
		setLoading(true)
		try {
			const response = await FileServiceClient.getBmsAutosarQualityReport(
				BmsAutosarQualityReportRequest.create({}),
			)
			setReport(response)
		} catch (error: any) {
			console.error("Failed to load BMS AUTOSAR quality report:", error)
		} finally {
			setLoading(false)
		}
	}, [])

	useEffect(() => {
		if (isOpen) {
			fetchReport()
		}
	}, [isOpen, fetchReport])

	const handleOpenFile = async (filePath: string) => {
		try {
			await FileServiceClient.openFileRelativePath(StringRequest.create({ value: filePath }))
		} catch (error: any) {
			console.error("Failed to open file:", error)
		}
	}

	const handleAutoFix = async (filePath: string) => {
		setFixingFile(filePath)
		try {
			const response = await FileServiceClient.autoFixBmsAutosarFile(
				AutoFixBmsAutosarFileRequest.create({ filePath, apply: false }),
			)
			setPreview(response)
		} catch (error: any) {
			console.error("Auto-fix failed:", error)
			// eslint-disable-next-line no-alert
			alert(`Auto-fix failed: ${error?.message || error}`)
		} finally {
			setFixingFile(null)
		}
	}

	const handleApplyFix = async () => {
		if (!preview?.filePath) {
			return
		}
		setFixingFile(preview.filePath)
		try {
			const response = await FileServiceClient.autoFixBmsAutosarFile(
				AutoFixBmsAutosarFileRequest.create({ filePath: preview.filePath, apply: true }),
			)
			setPreview(null)
			await fetchReport()
			// eslint-disable-next-line no-alert
			alert(response.message)
		} catch (error: any) {
			console.error("Apply fix failed:", error)
			// eslint-disable-next-line no-alert
			alert(`Apply fix failed: ${error?.message || error}`)
		} finally {
			setFixingFile(null)
		}
	}

	const matchesFilters = (issue: BmsAutosarQualityIssue) => {
		const severityMatch = selectedSeverity === "all" || issue.severity === selectedSeverity
		const categoryMatch = selectedCategory === "all" || issue.category === selectedCategory
		return severityMatch && categoryMatch
	}

	const filteredFiles = report?.files.filter((file) => file.issues.some(matchesFilters)) || []

	const totalIssues = report?.total ?? 0

	return (
		<>
			<Tooltip>
				<TooltipContent>BMS AUTOSAR Quality Report</TooltipContent>
				<TooltipTrigger>
					<VSCodeButton
						appearance="icon"
						aria-label="BMS AUTOSAR Quality Report"
						className="p-0 m-0 flex items-center"
						onClick={() => setIsOpen(true)}>
						<i className="codicon codicon-verify" style={{ fontSize: "12.5px" }} />
					</VSCodeButton>
				</TooltipTrigger>
			</Tooltip>

			<Dialog open={isOpen} onOpenChange={setIsOpen}>
				<DialogContent className="max-w-3xl max-h-[90vh] flex flex-col">
					<DialogHeader>
						<DialogTitle>BMS AUTOSAR Quality Report</DialogTitle>
						<DialogDescription>
							{totalIssues === 0
								? "No quality or MISRA issues recorded for this workspace."
								: ` ${report?.errors ?? 0} errors, ${report?.warnings ?? 0} warnings, ${report?.info ?? 0} info notes across ${report?.files.length ?? 0} file(s).`}
						</DialogDescription>
					</DialogHeader>

					<div className="flex items-center gap-2 mt-3 flex-wrap">
						{(["all", ...severityOrder] as const).map((sev) => (
							<button
								key={sev}
								onClick={() => setSelectedSeverity(sev)}
								className={`text-xs px-2 py-1 rounded border ${
									selectedSeverity === sev
										? "bg-[var(--vscode-button-background)] text-[var(--vscode-button-foreground)] border-transparent"
										: "bg-[var(--vscode-editor-background)] text-[var(--vscode-foreground)]"
								}`}>
								{sev === "all" ? "All" : `${severityIcon(sev as Severity)} ${sev}`}
							</button>
						))}
						<div className="w-px h-4 bg-[var(--vscode-panel-border)] mx-1" />
						{(["all", ...categories] as const).map((cat) => (
							<button
								key={cat}
								onClick={() => setSelectedCategory(cat)}
								className={`text-xs px-2 py-1 rounded border ${
									selectedCategory === cat
										? "bg-[var(--vscode-button-background)] text-[var(--vscode-button-foreground)] border-transparent"
										: "bg-[var(--vscode-editor-background)] text-[var(--vscode-foreground)]"
								}`}>
								{cat === "all" ? "All" : cat}
							</button>
						))}
						<div className="flex-1" />
						<VSCodeButton appearance="icon" aria-label="Refresh" onClick={fetchReport} disabled={loading}>
							<i className={`codicon codicon-refresh ${loading ? "animate-spin" : ""}`} style={{ fontSize: "12.5px" }} />
						</VSCodeButton>
					</div>

					<div className="flex-1 overflow-y-auto mt-3 border border-[var(--vscode-panel-border)] rounded">
						{loading ? (
							<div className="text-sm text-description py-4 text-center">Loading...</div>
						) : filteredFiles.length === 0 ? (
							<div className="text-sm text-description py-4 text-center">No issues match the selected filter.</div>
						) : (
							<ul className="divide-y divide-[var(--vscode-panel-border)]">
								{filteredFiles.map((file: BmsAutosarQualityReportFile, fileIndex) => (
									<li key={fileIndex} className="py-2 px-2">
										<div className="flex items-center justify-between gap-2">
											<button
												onClick={() => handleOpenFile(file.filePath)}
												className="text-xs font-medium text-[var(--vscode-textLink-foreground)] hover:underline text-left">
												{file.filePath}
											</button>
											{file.issues.some((i) => i.severity === "error" || i.severity === "warning") && (
												<VSCodeButton
													appearance="icon"
													aria-label={`Auto-fix ${file.filePath}`}
													className="p-0 m-0 flex items-center"
													disabled={fixingFile === file.filePath}
													onClick={() => handleAutoFix(file.filePath)}>
													<i
														className={`codicon codicon-wand ${fixingFile === file.filePath ? "animate-pulse" : ""}`}
														style={{ fontSize: "12.5px" }}
													/>
												</VSCodeButton>
											)}
										</div>
										<ul className="mt-1 space-y-0.5">
											{file.issues
												.filter(matchesFilters)
												.map((issue, issueIndex) => (
													<li
														key={issueIndex}
														className="text-xs flex items-start gap-1.5">
														<span className={severityClass(issue.severity as Severity)}>
															{severityIcon(issue.severity as Severity)}
														</span>
														<span className="text-[var(--vscode-foreground)]">
															{issue.message}
															{issue.line > 0 && (
																<span className="text-[var(--vscode-descriptionForeground)] ml-1">
																	(line {issue.line})
																</span>
															)}
														</span>
													</li>
												))}
										</ul>
									</li>
								))}
							</ul>
						)}
					</div>
				</DialogContent>
			</Dialog>

			<Dialog open={!!preview} onOpenChange={() => setPreview(null)}>
				<DialogContent className="max-w-4xl max-h-[90vh] flex flex-col">
					<DialogHeader>
						<DialogTitle>Auto-fix Preview: {preview?.filePath}</DialogTitle>
						<DialogDescription>
							{preview?.fixed
								? "The LLM produced the following changes. Review and click Apply Fix to write them to disk."
								: preview?.message || "No changes were produced."}
						</DialogDescription>
					</DialogHeader>

					{preview?.fixed && (
						<>
							<div className="flex-1 overflow-auto mt-3 border border-[var(--vscode-panel-border)] rounded bg-[var(--vscode-editor-background)]">
								<pre className="text-xs font-mono p-3 whitespace-pre">{preview.diff || preview.fixedContent}</pre>
							</div>

							<div className="flex justify-end gap-2 mt-3">
								<VSCodeButton appearance="secondary" onClick={() => setPreview(null)}>
									Cancel
								</VSCodeButton>
								<VSCodeButton appearance="primary" onClick={handleApplyFix} disabled={!!fixingFile}>
									{fixingFile ? "Applying..." : "Apply Fix"}
								</VSCodeButton>
							</div>
						</>
					)}
				</DialogContent>
			</Dialog>
		</>
	)
}
