import { VSCodeButton } from "@vscode/webview-ui-toolkit/react"
import React, { useCallback, useEffect, useRef, useState } from "react"
import ViewHeader from "@/components/common/ViewHeader"
import { useExtensionState } from "@/context/ExtensionStateContext"
import { BmsAutosarServiceClient, FileServiceClient } from "@/services/grpc-client"
import {
	BmsAutosarQualityReport,
	BmsAutosarQualityReportRequest,
	BmsKnowledgeList,
	BmsKnowledgeListRequest,
	ListBmsAutosarTemplatesRequest,
} from "@shared/proto/cline/file"
import {
	BmsAutosarCompileProfilesList,
	ListBmsAutosarCompileProfilesRequest,
} from "@shared/proto/cline/bms_autosar"
import BmsKnowledgeManager from "@/components/chat/BmsKnowledgeManager"
import type { BmsKnowledgeManagerRef } from "@/components/chat/BmsKnowledgeManager"
import BmsAutosarCompileManager from "@/components/chat/BmsAutosarCompileManager"
import type { BmsAutosarCompileManagerRef } from "@/components/chat/BmsAutosarCompileManager"

interface MetricCardProps {
	label: string
	value: string | number
	subtext?: string
	accent?: "error" | "warning" | "info" | "success" | "default"
}

const accentClass = (accent?: MetricCardProps["accent"]) => {
	switch (accent) {
		case "error":
			return "text-[var(--vscode-errorForeground)]"
		case "warning":
			return "text-[var(--vscode-editorWarning-foreground)]"
		case "info":
			return "text-[var(--vscode-descriptionForeground)]"
		case "success":
			return "text-[var(--vscode-terminal-ansiGreen)]"
		default:
			return "text-[var(--vscode-foreground)]"
	}
}

const MetricCard: React.FC<MetricCardProps> = ({ label, value, subtext, accent = "default" }) => (
	<div className="flex flex-col p-4 rounded-md border border-[var(--vscode-panel-border)] bg-[var(--vscode-editor-background)]">
		<span className="text-xs text-[var(--vscode-descriptionForeground)] mb-1">{label}</span>
		<span className={`text-2xl font-semibold ${accentClass(accent)}`}>{value}</span>
		{subtext && <span className="text-xs text-[var(--vscode-descriptionForeground)] mt-1 truncate">{subtext}</span>}
	</div>
)

interface ActionCardProps {
	title: string
	description: string
	icon: string
	onClick: () => void
}

const ActionCard: React.FC<ActionCardProps> = ({ title, description, icon, onClick }) => (
	<button
		onClick={onClick}
		className="flex flex-col items-start p-4 rounded-md border border-[var(--vscode-panel-border)] bg-[var(--vscode-editor-background)] hover:bg-[var(--vscode-list-hoverBackground)] transition-colors text-left">
		<i className={`codicon ${icon} text-xl mb-2 text-[var(--vscode-button-background)]`} />
		<span className="text-sm font-medium text-[var(--vscode-foreground)]">{title}</span>
		<span className="text-xs text-[var(--vscode-descriptionForeground)] mt-1">{description}</span>
	</button>
)

export const BmsAutosarDashboard: React.FC<{ onDone: () => void }> = ({ onDone }) => {
	const {
		environment,
		navigateToBmsAutosarWizard,
		navigateToBmsAutosarQualityReport,
		navigateToBmsAutosarKnowledgeGraph,
	} = useExtensionState()

	const knowledgeRef = useRef<BmsKnowledgeManagerRef>(null)
	const compileRef = useRef<BmsAutosarCompileManagerRef>(null)

	const [quality, setQuality] = useState<BmsAutosarQualityReport | null>(null)
	const [knowledge, setKnowledge] = useState<BmsKnowledgeList | null>(null)
	const [compileProfiles, setCompileProfiles] = useState<BmsAutosarCompileProfilesList | null>(null)
	const [templateCount, setTemplateCount] = useState<number | null>(null)
	const [loading, setLoading] = useState(false)

	const fetchMetrics = useCallback(async () => {
		setLoading(true)
		try {
			const [qualityRes, knowledgeRes, profilesRes, templatesRes] = await Promise.all([
				FileServiceClient.getBmsAutosarQualityReport(BmsAutosarQualityReportRequest.create({})),
				Promise.all([
					FileServiceClient.listBmsKnowledge(BmsKnowledgeListRequest.create({ scope: "workspace" })),
					FileServiceClient.listBmsKnowledge(BmsKnowledgeListRequest.create({ scope: "global" })),
				]),
				BmsAutosarServiceClient.listBmsAutosarCompileProfiles(ListBmsAutosarCompileProfilesRequest.create({})),
				FileServiceClient.listBmsAutosarTemplates(ListBmsAutosarTemplatesRequest.create({})),
			])
			setQuality(qualityRes)
			setKnowledge({
				entries: [...(knowledgeRes[0].entries || []), ...(knowledgeRes[1].entries || [])],
			})
			setCompileProfiles(profilesRes)
			setTemplateCount(templatesRes.entries?.length ?? 0)
		} catch (error) {
			console.error("Failed to load BMS AUTOSAR dashboard metrics:", error)
		} finally {
			setLoading(false)
		}
	}, [])

	useEffect(() => {
		fetchMetrics()
	}, [fetchMetrics])

	const knowledgeCount = knowledge?.entries?.length ?? 0
	const profileCount = compileProfiles?.profiles?.length ?? 0
	const lastProfile = compileProfiles?.profiles?.find((p) => p.id === compileProfiles.lastSelectedId)

	return (
		<div className="flex flex-col h-screen w-full overflow-hidden bg-[var(--vscode-editor-background)]">
			<ViewHeader title="BMS AUTOSAR Dashboard" onDone={onDone} environment={environment} />

			<div className="flex-1 overflow-y-auto px-5 pb-6">
				{loading && (
					<div className="flex items-center justify-center h-32 text-[var(--vscode-descriptionForeground)] text-sm">
						<i className="codicon codicon-loading codicon-modifier-spin mr-2" />
						Loading dashboard...
					</div>
				)}

				<section className="mb-6">
					<h4 className="text-sm font-medium text-[var(--vscode-foreground)] mb-3">Quick Actions</h4>
					<div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
						<ActionCard
							title="Generator"
							description="Create BMS AUTOSAR components"
							icon="codicon-symbol-color"
							onClick={navigateToBmsAutosarWizard}
						/>
						<ActionCard
							title="Knowledge"
							description="Import and manage documents"
							icon="codicon-book"
							onClick={() => knowledgeRef.current?.open()}
						/>
						<ActionCard
							title="Compile"
							description="Run build profiles"
							icon="codicon-tools"
							onClick={() => compileRef.current?.open()}
						/>
						<ActionCard
							title="Quality Report"
							description="Review MISRA and ASIL issues"
							icon="codicon-verified"
							onClick={navigateToBmsAutosarQualityReport}
						/>
						<ActionCard
							title="Knowledge Graph"
							description="Explore ARXML relationships"
							icon="codicon-graph"
							onClick={navigateToBmsAutosarKnowledgeGraph}
						/>
					</div>
				</section>

				<section className="mb-6">
					<h4 className="text-sm font-medium text-[var(--vscode-foreground)] mb-3">Live Metrics</h4>
					<div className="grid grid-cols-2 md:grid-cols-4 gap-3">
						<MetricCard
							label="Quality Errors"
							value={quality?.errors ?? "—"}
							accent={quality?.errors ? "error" : "success"}
						/>
						<MetricCard
							label="Quality Warnings"
							value={quality?.warnings ?? "—"}
							accent={quality?.warnings ? "warning" : "success"}
						/>
						<MetricCard
							label="Knowledge Entries"
							value={knowledgeCount}
							accent={knowledgeCount > 0 ? "default" : "info"}
						/>
						<MetricCard
							label="Compile Profiles"
							value={profileCount}
							subtext={lastProfile ? `Last: ${lastProfile.name}` : undefined}
							accent={profileCount > 0 ? "default" : "info"}
						/>
					</div>
					{templateCount !== null && (
						<div className="mt-3 text-xs text-[var(--vscode-descriptionForeground)]">
							Component library: {templateCount} template{templateCount === 1 ? "" : "s"} available.
						</div>
					)}
				</section>

				<section>
					<h4 className="text-sm font-medium text-[var(--vscode-foreground)] mb-3">Recent Issues</h4>
					{quality?.files && quality.files.length > 0 ? (
						<div className="space-y-2">
							{quality.files.slice(0, 5).map((file) => (
								<div
									key={file.filePath}
									className="flex items-center justify-between p-3 rounded-md border border-[var(--vscode-panel-border)] bg-[var(--vscode-editor-background)]">
									<div className="min-w-0">
										<div className="text-xs text-[var(--vscode-foreground)] truncate">{file.filePath}</div>
										<div className="text-xs text-[var(--vscode-descriptionForeground)]">
											{file.issues.length} issue{file.issues.length === 1 ? "" : "s"}
										</div>
									</div>
									<div className="flex items-center gap-2 text-xs">
										{file.issues.some((i) => i.severity === "error") && (
											<span className="text-[var(--vscode-errorForeground)]">❌ Error</span>
										)}
										{file.issues.some((i) => i.severity === "warning") && (
											<span className="text-[var(--vscode-editorWarning-foreground)]">⚠️ Warning</span>
										)}
										{file.issues.every((i) => i.severity === "info") && (
											<span className="text-[var(--vscode-descriptionForeground)]">ℹ️ Info</span>
										)}
									</div>
								</div>
							))}
							{quality.files.length > 5 && (
								<div className="text-xs text-[var(--vscode-descriptionForeground)] mt-1">
									{quality.files.length - 5} more file(s) — open Quality Report for details.
								</div>
							)}
						</div>
					) : (
						<div className="text-sm text-[var(--vscode-descriptionForeground)]">
							No quality issues recorded. Generate or compile BMS AUTOSAR artifacts to populate the report.
						</div>
					)}
					<div className="mt-4">
						<VSCodeButton onClick={fetchMetrics} appearance="secondary">
							<i className="codicon codicon-refresh mr-1" />
							Refresh
						</VSCodeButton>
					</div>
				</section>
			</div>

			<BmsKnowledgeManager ref={knowledgeRef} />
			<BmsAutosarCompileManager ref={compileRef} />
		</div>
	)
}

export default BmsAutosarDashboard
