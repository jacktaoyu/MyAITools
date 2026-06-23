import { VSCodeButton } from "@vscode/webview-ui-toolkit/react"
import React, { useCallback, useEffect, useState } from "react"
import {
	BmsAutosarKnowledgeGraph,
	BmsAutosarKnowledgeGraphRequest,
} from "@shared/proto/cline/file"
import { BooleanRequest } from "@shared/proto/cline/common"
import ViewHeader from "@/components/common/ViewHeader"
import { useExtensionState } from "@/context/ExtensionStateContext"
import { FileServiceClient } from "@/services/grpc-client"
import { BmsAutosarKnowledgeGraphRenderer } from "./BmsAutosarKnowledgeGraphRenderer"

export const BmsAutosarKnowledgeGraphView: React.FC<{ onDone: () => void }> = ({ onDone }) => {
	const { environment } = useExtensionState()
	const [scope, setScope] = useState<"workspace" | "global">("workspace")
	const [arxmlFiles, setArxmlFiles] = useState<string[]>([])
	const [graph, setGraph] = useState<BmsAutosarKnowledgeGraph | null>(null)
	const [loading, setLoading] = useState(false)
	const [dimensions, setDimensions] = useState({ width: 800, height: 500 })

	const fetchGraph = useCallback(async () => {
		setLoading(true)
		try {
			const response = await FileServiceClient.getBmsAutosarKnowledgeGraph(
				BmsAutosarKnowledgeGraphRequest.create({ scope, filePaths: arxmlFiles }),
			)
			setGraph(response)
		} catch (error: any) {
			console.error("Failed to load ARXML knowledge graph:", error)
		} finally {
			setLoading(false)
		}
	}, [scope, arxmlFiles])

	useEffect(() => {
		fetchGraph()
	}, [fetchGraph])

	useEffect(() => {
		const updateDimensions = () => {
			const container = document.getElementById("arxml-graph-container")
			if (container) {
				const rect = container.getBoundingClientRect()
				setDimensions({ width: Math.max(600, rect.width), height: Math.max(400, rect.height) })
			}
		}
		updateDimensions()
		window.addEventListener("resize", updateDimensions)
		return () => window.removeEventListener("resize", updateDimensions)
	}, [])

	const selectArxmlFiles = async () => {
		try {
			const response = await FileServiceClient.selectFiles(BooleanRequest.create({ value: false }))
			const picked = response?.values2?.filter((p) => p.toLowerCase().endsWith(".arxml")) ?? []
			if (picked.length > 0) {
				setArxmlFiles(picked)
			}
		} catch (error: any) {
			console.error("Failed to select ARXML files:", error)
		}
	}

	return (
		<div className="fixed inset-0 flex flex-col bg-[var(--vscode-editor-background)]">
			<ViewHeader title="ARXML Knowledge Graph" onDone={onDone} environment={environment} />

			<div id="arxml-graph-container" className="flex-1 overflow-hidden flex flex-col px-5 pb-5">
				<BmsAutosarKnowledgeGraphRenderer
					nodes={graph?.nodes ?? []}
					edges={graph?.edges ?? []}
					width={dimensions.width}
					height={dimensions.height}
					loading={loading}
					emptyMessage="No ARXML graph data available. Import ARXML files into the BMS knowledge base or select them above.">
					<select
						value={scope}
						onChange={(e) => setScope(e.target.value as "workspace" | "global")}
						className="text-xs px-2 py-1 rounded border bg-[var(--vscode-editor-background)] text-[var(--vscode-foreground)]">
						<option value="workspace">Workspace</option>
						<option value="global">Global</option>
					</select>
					<VSCodeButton appearance="secondary" onClick={selectArxmlFiles}>
						Select ARXML Files
					</VSCodeButton>
					{arxmlFiles.length > 0 && (
						<>
							<span className="text-xs text-[var(--vscode-descriptionForeground)]">
								{arxmlFiles.length} file(s) selected
							</span>
							<VSCodeButton appearance="icon" aria-label="Clear selection" onClick={() => setArxmlFiles([])}>
								<i className="codicon codicon-clear-all" style={{ fontSize: "12.5px" }} />
							</VSCodeButton>
						</>
					)}
					<VSCodeButton appearance="icon" aria-label="Refresh" onClick={fetchGraph} disabled={loading}>
						<i className={`codicon codicon-refresh ${loading ? "animate-spin" : ""}`} style={{ fontSize: "12.5px" }} />
					</VSCodeButton>
					{arxmlFiles.length > 0 && (
						<div className="text-xs text-[var(--vscode-descriptionForeground)]">
							{arxmlFiles.map((f) => f.split(/[/\\]/).pop()).join(", ")}
						</div>
					)}
				</BmsAutosarKnowledgeGraphRenderer>
			</div>
		</div>
	)
}

export default BmsAutosarKnowledgeGraphView
