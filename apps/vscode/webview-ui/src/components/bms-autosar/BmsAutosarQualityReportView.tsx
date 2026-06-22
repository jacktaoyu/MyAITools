import { VSCodeButton } from "@vscode/webview-ui-toolkit/react"
import React, { useCallback, useEffect, useState } from "react"
import {
	AutoFixBmsAutosarFileRequest,
	AutoFixBmsAutosarFileResponse,
	AutoFixBmsAutosarFilesRequest,
	AutoFixBmsAutosarFilesResponse,
	BmsAutosarQualityReport,
	BmsAutosarQualityReportFile,
	BmsAutosarQualityReportRequest,
} from "@shared/proto/cline/file"
import { StringRequest } from "@shared/proto/cline/common"
import ViewHeader from "@/components/common/ViewHeader"
import { useExtensionState } from "@/context/ExtensionStateContext"
import { FileServiceClient } from "@/services/grpc-client"

type Severity = "error" | "warning" | "info"

const severityOrder: Severity[] = ["error", "warning", "info"]

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

export const BmsAutosarQualityReportView: React.FC<{ onDone: () => void }> = ({ onDone }) => {
	const { environment } = useExtensionState()
	const [report, setReport] = useState<BmsAutosarQualityReport | null>(null)
	const [loading, setLoading] = useState(false)
	const [fixingFile, setFixingFile] = useState<string | null>(null)
	const [selectedSeverity, setSelectedSeverity] = useState<Severity | "all">("all")
	const [preview, setPreview] = useState<AutoFixBmsAutosarFileResponse | null>(null)
	const [batchPreview, setBatchPreview] = useState<AutoFixBmsAutosarFilesResponse | null>(null)
	const [batchFixing, setBatchFixing] = useState(false)

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
		fetchReport()
	}, [fetchReport])

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
			alert(response.message)
		} catch (error: any) {
			console.error("Apply fix failed:", error)
			alert(`Apply fix failed: ${error?.message || error}`)
		} finally {
			setFixingFile(null)
		}
	}

	const fixableFilePaths = report?.files
		.filter((file) => file.issues.some((i) => i.severity === "error" || i.severity === "warning"))
		.map((file) => file.filePath) ?? []

	const handleFixAll = async () => {
		if (fixableFilePaths.length === 0) {
			return
		}
		setBatchFixing(true)
		try {
			const response = await FileServiceClient.autoFixBmsAutosarFiles(
				AutoFixBmsAutosarFilesRequest.create({ filePaths: fixableFilePaths, apply: false }),
			)
			setBatchPreview(response)
		} catch (error: any) {
			console.error("Batch auto-fix failed:", error)
			alert(`Batch auto-fix failed: ${error?.message || error}`)
		} finally {
			setBatchFixing(false)
		}
	}

	const handleApplyAllFixes = async () => {
		if (!batchPreview?.results || batchPreview.results.length === 0) {
			return
		}
		setBatchFixing(true)
		try {
			const response = await FileServiceClient.autoFixBmsAutosarFiles(
				AutoFixBmsAutosarFilesRequest.create({ filePaths: fixableFilePaths, apply: true }),
			)
			setBatchPreview(null)
			await fetchReport()
			alert(response.message)
		} catch (error: any) {
			console.error("Apply all fixes failed:", error)
			alert(`Apply all fixes failed: ${error?.message || error}`)
		} finally {
			setBatchFixing(false)
		}
	}

	const filteredFiles =
		report?.files.filter((file) =>
			selectedSeverity === "all" ? true : file.issues.some((issue) => issue.severity === selectedSeverity),
		) || []

	const totalIssues = report?.total ?? 0

	return (
		<div className="fixed inset-0 flex flex-col bg-[var(--vscode-editor-background)]">
			<ViewHeader title="BMS AUTOSAR Quality Report" onDone={onDone} environment={environment} />

			<div className="flex-1 overflow-hidden flex flex-col px-5 pb-5">
				<div className="text-sm text-[var(--vscode-descriptionForeground)] mb-3">
					{totalIssues === 0
						? "No quality or MISRA issues recorded for this workspace."
						: `${report?.errors ?? 0} errors, ${report?.warnings ?? 0} warnings, ${report?.info ?? 0} info notes across ${report?.files.length ?? 0} file(s).`}
				</div>

				<div className="flex items-center gap-2 mb-3">
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
					<div className="flex-1" />
					{fixableFilePaths.length > 0 && (
						<VSCodeButton
							appearance="primary"
							aria-label="Fix all issues"
							onClick={handleFixAll}
							disabled={batchFixing}>
							<i className={`codicon codicon-wand ${batchFixing ? "animate-pulse" : ""}`} style={{ fontSize: "12.5px" }} />
							<span className="ml-1 text-xs">Fix All</span>
						</VSCodeButton>
					)}
					<VSCodeButton appearance="icon" aria-label="Refresh" onClick={fetchReport} disabled={loading}>
						<i
							className={`codicon codicon-refresh ${loading ? "animate-spin" : ""}`}
							style={{ fontSize: "12.5px" }}
						/>
					</VSCodeButton>
				</div>

				<div className="flex-1 overflow-y-auto border border-[var(--vscode-panel-border)] rounded">
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
											.filter((issue) => (selectedSeverity === "all" ? true : issue.severity === selectedSeverity))
											.map((issue, issueIndex) => (
												<li key={issueIndex} className="text-xs flex items-start gap-1.5">
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
			</div>

			{preview && (
				<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
					<div className="bg-[var(--vscode-editor-background)] border border-[var(--vscode-panel-border)] rounded max-w-4xl w-full max-h-[90vh] flex flex-col p-5">
						<h3 className="text-lg font-normal mb-2">Auto-fix Preview: {preview.filePath}</h3>
						<p className="text-sm text-[var(--vscode-descriptionForeground)] mb-3">
							{preview.fixed
								? "The LLM produced the following changes. Review and click Apply Fix to write them to disk."
								: preview.message || "No changes were produced."}
						</p>
						{preview.fixed && (
							<>
								<div className="flex-1 overflow-auto border border-[var(--vscode-panel-border)] rounded bg-[var(--vscode-editor-background)] min-h-[300px]">
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
						{!preview.fixed && (
							<div className="flex justify-end mt-3">
								<VSCodeButton appearance="secondary" onClick={() => setPreview(null)}>
									Close
								</VSCodeButton>
							</div>
						)}
					</div>
				</div>
			)}

			{batchPreview && (
				<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
					<div className="bg-[var(--vscode-editor-background)] border border-[var(--vscode-panel-border)] rounded max-w-5xl w-full max-h-[90vh] flex flex-col p-5">
						<h3 className="text-lg font-normal mb-2">Batch Auto-fix Preview</h3>
						<p className="text-sm text-[var(--vscode-descriptionForeground)] mb-3">
							{batchPreview.fixedCount === 0
								? batchPreview.message || "No changes were produced for any file."
								: `${batchPreview.message} Review the diffs below and click Apply All Fixes to write them to disk.`}
						</p>
						{batchPreview.fixedCount > 0 && (
							<>
								<div className="flex-1 overflow-auto border border-[var(--vscode-panel-border)] rounded bg-[var(--vscode-editor-background)] min-h-[300px]">
									{batchPreview.results
										.filter((result) => result.fixed)
										.map((result, index) => (
												<div key={index} className="border-b border-[var(--vscode-panel-border)] last:border-b-0">
													<div className="sticky top-0 bg-[var(--vscode-editor-background)] px-3 py-2 text-xs font-medium border-b border-[var(--vscode-panel-border)]">
														{result.filePath}
													</div>
													<pre className="text-xs font-mono p-3 whitespace-pre">{result.diff || result.fixedContent}</pre>
												</div>
											))}
								</div>
								<div className="flex justify-end gap-2 mt-3">
									<VSCodeButton appearance="secondary" onClick={() => setBatchPreview(null)}>
										Cancel
									</VSCodeButton>
									<VSCodeButton appearance="primary" onClick={handleApplyAllFixes} disabled={batchFixing}>
										{batchFixing ? "Applying..." : "Apply All Fixes"}
									</VSCodeButton>
								</div>
							</>
						)}
						{batchPreview.fixedCount === 0 && (
							<div className="flex justify-end mt-3">
								<VSCodeButton appearance="secondary" onClick={() => setBatchPreview(null)}>
									Close
								</VSCodeButton>
							</div>
						)}
					</div>
				</div>
			)}
		</div>
	)
}

export default BmsAutosarQualityReportView
