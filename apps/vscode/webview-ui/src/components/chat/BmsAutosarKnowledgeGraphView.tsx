import { VSCodeButton } from "@vscode/webview-ui-toolkit/react"
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
	BmsAutosarKnowledgeGraph,
	BmsAutosarKnowledgeGraphEdge,
	BmsAutosarKnowledgeGraphNode,
	BmsAutosarKnowledgeGraphRequest,
} from "@shared/proto/cline/file"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { FileServiceClient } from "@/services/grpc-client"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"

interface GraphNode extends BmsAutosarKnowledgeGraphNode {
	x: number
	y: number
	radius: number
}

const TYPE_COLORS: Record<string, string> = {
	"APPLICATION-SW-COMPONENT-TYPE": "#4EC9B0",
	"SERVICE-SW-COMPONENT-TYPE": "#4EC9B0",
	"COMPOSITION-SW-COMPONENT-TYPE": "#4EC9B0",
	"P-PORT-PROTOTYPE": "#9CDCFE",
	"R-PORT-PROTOTYPE": "#9CDCFE",
	"SENDER-RECEIVER-INTERFACE": "#CE9178",
	"CLIENT-SERVER-INTERFACE": "#CE9178",
	"IMPLEMENTATION-DATA-TYPE": "#B5CEA8",
	"APPLICATION-PRIMITIVE-DATA-TYPE": "#B5CEA8",
	"RUNNABLE-ENTITY": "#C586C0",
	"DATA-PROTOTYPE": "#DCDCAA",
	"AR-PACKAGE": "#808080",
	UNKNOWN: "#808080",
}

const NODE_RADIUS = 28

function simpleForceLayout(
	nodes: GraphNode[],
	edges: BmsAutosarKnowledgeGraphEdge[],
	width: number,
	height: number,
	iterations = 80,
): void {
	// Initialize around center.
	nodes.forEach((node, i) => {
		const angle = (i / nodes.length) * 2 * Math.PI
		node.x = width / 2 + Math.cos(angle) * Math.min(width, height) * 0.25
		node.y = height / 2 + Math.sin(angle) * Math.min(width, height) * 0.25
		node.radius = NODE_RADIUS
	})

	const k = Math.sqrt((width * height) / (nodes.length + 1)) * 0.6
	const center = { x: width / 2, y: height / 2 }

	for (let iter = 0; iter < iterations; iter++) {
		// Repulsive forces.
		for (let i = 0; i < nodes.length; i++) {
			for (let j = i + 1; j < nodes.length; j++) {
				const a = nodes[i]
				const b = nodes[j]
				let dx = a.x - b.x
				let dy = a.y - b.y
				let dist = Math.sqrt(dx * dx + dy * dy) || 1
				if (dist < 200) {
					const force = (k * k) / dist
					dx = (dx / dist) * force
					dy = (dy / dist) * force
					a.x += dx * 0.05
					a.y += dy * 0.05
					b.x -= dx * 0.05
					b.y -= dy * 0.05
				}
			}
		}

		// Attractive forces along edges.
		for (const edge of edges) {
			const source = nodes.find((n) => n.id === edge.source)
			const target = nodes.find((n) => n.id === edge.target)
			if (!source || !target) continue
			let dx = target.x - source.x
			let dy = target.y - source.y
			const dist = Math.sqrt(dx * dx + dy * dy) || 1
			const force = (dist * dist) / k
			dx = (dx / dist) * force * 0.03
			dy = (dy / dist) * force * 0.03
			source.x += dx
			source.y += dy
			target.x -= dx
			target.y -= dy
		}

		// Pull toward center.
		for (const node of nodes) {
			node.x += (center.x - node.x) * 0.02
			node.y += (center.y - node.y) * 0.02
		}

		// Keep inside bounds.
		for (const node of nodes) {
			node.x = Math.max(node.radius, Math.min(width - node.radius, node.x))
			node.y = Math.max(node.radius, Math.min(height - node.radius, node.y))
		}
	}
}

export const BmsAutosarKnowledgeGraphView: React.FC<{ scope: "workspace" | "global" }> = ({ scope }) => {
	const [isOpen, setIsOpen] = useState(false)
	const [graph, setGraph] = useState<BmsAutosarKnowledgeGraph | null>(null)
	const [loading, setLoading] = useState(false)
	const [selectedNode, setSelectedNode] = useState<string | null>(null)
	const containerRef = useRef<HTMLDivElement>(null)
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
		if (containerRef.current) {
			const rect = containerRef.current.getBoundingClientRect()
			setDimensions({ width: Math.max(600, rect.width), height: 500 })
		}
	}, [isOpen])

	const layoutedNodes = useMemo(() => {
		if (!graph || graph.nodes.length === 0) return []
		const nodes = graph.nodes.map((n) => ({ ...n, x: 0, y: 0, radius: NODE_RADIUS }))
		simpleForceLayout(nodes, graph.edges, dimensions.width, dimensions.height)
		return nodes
	}, [graph, dimensions])

	const filteredEdges = useMemo(() => {
		if (!graph) return []
		if (!selectedNode) return graph.edges
		return graph.edges.filter((e) => e.source === selectedNode || e.target === selectedNode)
	}, [graph, selectedNode])

	const nodeIds = useMemo(() => new Set(layoutedNodes.map((n) => n.id)), [layoutedNodes])
	const visibleEdges = filteredEdges.filter((e) => nodeIds.has(e.source) && nodeIds.has(e.target))

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

					<div className="flex items-center gap-2 mt-2">
						<button
							onClick={() => setSelectedNode(null)}
							className={`text-xs px-2 py-1 rounded border ${
								selectedNode === null
									? "bg-[var(--vscode-button-background)] text-[var(--vscode-button-foreground)] border-transparent"
									: "bg-[var(--vscode-editor-background)] text-[var(--vscode-foreground)]"
							}`}>
							All edges
						</button>
						<div className="flex-1" />
						<VSCodeButton appearance="icon" aria-label="Refresh" onClick={fetchGraph} disabled={loading}>
							<i className={`codicon codicon-refresh ${loading ? "animate-spin" : ""}`} style={{ fontSize: "12.5px" }} />
						</VSCodeButton>
					</div>

					<div
						ref={containerRef}
						className="flex-1 mt-3 border border-[var(--vscode-panel-border)] rounded bg-[var(--vscode-editor-background)] overflow-hidden"
						style={{ minHeight: 500 }}>
						{loading ? (
							<div className="text-sm text-description py-4 text-center">Building graph...</div>
						) : layoutedNodes.length === 0 ? (
							<div className="text-sm text-description py-4 text-center">No ARXML graph data available.</div>
						) : (
							<svg width={dimensions.width} height={dimensions.height}>
								{visibleEdges.map((edge, i) => {
									const source = layoutedNodes.find((n) => n.id === edge.source)
									const target = layoutedNodes.find((n) => n.id === edge.target)
									if (!source || !target) return null
									return (
										<line
											key={i}
											x1={source.x}
											y1={source.y}
											x2={target.x}
											y2={target.y}
											stroke="var(--vscode-panel-border)"
											strokeWidth={1}
										/>
									)
								})}
								{layoutedNodes.map((node) => (
									<g
										key={node.id}
										transform={`translate(${node.x}, ${node.y})`}
										className="cursor-pointer"
										onClick={() => setSelectedNode(selectedNode === node.id ? null : node.id)}>
										<circle
											r={node.radius}
											fill={TYPE_COLORS[node.type] || TYPE_COLORS.UNKNOWN}
											stroke={selectedNode === node.id ? "var(--vscode-button-background)" : "transparent"}
											strokeWidth={3}
										/>
										<text
											textAnchor="middle"
											dy="0.35em"
											className="text-[10px] fill-white pointer-events-none"
											style={{ fontFamily: "var(--vscode-font-family)" }}>
											{node.name.length > 10 ? `${node.name.slice(0, 9)}…` : node.name}
										</text>
										<title>{`${node.type}: ${node.path}`}</title>
									</g>
								))}
							</svg>
						)}
					</div>

					{selectedNode && (
						<div className="mt-2 text-xs text-[var(--vscode-descriptionForeground)]">
							Selected: {layoutedNodes.find((n) => n.id === selectedNode)?.path}
						</div>
					)}
				</DialogContent>
			</Dialog>
		</>
	)
}
