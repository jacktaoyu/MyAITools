import { VSCodeButton } from "@vscode/webview-ui-toolkit/react"
import React, { useCallback, useEffect, useState } from "react"
import {
	BmsAutosarKnowledgeGraph,
	BmsAutosarKnowledgeGraphRequest,
} from "@shared/proto/cline/file"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { FileServiceClient } from "@/services/grpc-client"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { BmsAutosarKnowledgeGraphRenderer } from "@/components/bms-autosar/BmsAutosarKnowledgeGraphRenderer"

export const BmsAutosarKnowledgeGraphView: React.FC<{ scope: "workspace" | "global" }> = ({ scope }) => {
	const [isOpen, setIsOpen] = useState(false)
	const [graph, setGraph] = useState<BmsAutosarKnowledgeGraph | null>(null)
	const [loading, setLoading] = useState(false)
	const [dimensions, setDimensions] = useState({ width: 700, height: 500 })

	const fetchGraph = useCallback(async () => {
		setLoading(true)
		try {
			const response = await FileServiceClient.getBmsAutosarKnowledgeGraph(
				BmsAutosarKnowledgeGraphRequest.create({ scope }),
			)
			setGraph(response)
		} catch (error: any) {
			console.error("Failed to load ARXML knowledge graph:", error)
		} finally {
			setLoading(false)
		}
	}, [scope])

	useEffect(() => {
		if (isOpen) {
			fetchGraph()
		}
	}, [isOpen, fetchGraph])

	useEffect(() => {
		if (isOpen) {
			const container = document.getElementById("arxml-graph-dialog-container")
			if (container) {
				const rect = container.getBoundingClientRect()
				setDimensions({ width: Math.max(600, rect.width), height: 500 })
			}
		}
	}, [isOpen])

	return (
		<>
			<Tooltip>
				<TooltipContent>ARXML Knowledge Graph</TooltipContent>
				<TooltipTrigger>
					<VSCodeButton
						appearance="icon"
						aria-label="ARXML Knowledge Graph"
						className="p-0 m-0 flex items-center"
						onClick={() => setIsOpen(true)}>
						<i className="codicon codicon-graph" style={{ fontSize: "12.5px" }} />
					</VSCodeButton>
				</TooltipTrigger>
			</Tooltip>

			<Dialog open={isOpen} onOpenChange={setIsOpen}>
				<DialogContent className="max-w-4xl max-h-[90vh] flex flex-col">
					<DialogHeader>
						<DialogTitle>ARXML Knowledge Graph</DialogTitle>
						<DialogDescription>
							{graph
								? `${graph.nodes.length} nodes, ${graph.edges.length} edges`
								: "Visualize SWC / Port / Interface relationships from imported ARXML files."}
						</DialogDescription>
					</DialogHeader>

					<div id="arxml-graph-dialog-container" className="flex-1 flex flex-col min-h-[500px]">
						<BmsAutosarKnowledgeGraphRenderer
							nodes={graph?.nodes ?? []}
							edges={graph?.edges ?? []}
							width={dimensions.width}
							height={dimensions.height}
							loading={loading}
							emptyMessage="No ARXML graph data available.">
							<VSCodeButton appearance="icon" aria-label="Refresh" onClick={fetchGraph} disabled={loading}>
								<i
									className={`codicon codicon-refresh ${loading ? "animate-spin" : ""}`}
									style={{ fontSize: "12.5px" }}
								/>
							</VSCodeButton>
						</BmsAutosarKnowledgeGraphRenderer>
					</div>
				</DialogContent>
			</Dialog>
		</>
	)
}

export default BmsAutosarKnowledgeGraphView
