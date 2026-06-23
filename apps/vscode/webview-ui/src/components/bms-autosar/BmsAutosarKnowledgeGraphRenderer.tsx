import { VSCodeButton } from "@vscode/webview-ui-toolkit/react"
import React, { useMemo, useRef, useState } from "react"
import {
	BmsAutosarKnowledgeGraphEdge,
	BmsAutosarKnowledgeGraphNode,
} from "@shared/proto/cline/file"

interface GraphNode extends BmsAutosarKnowledgeGraphNode {
	x: number
	y: number
	radius: number
}

export const TYPE_COLORS: Record<string, string> = {
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
	nodes.forEach((node, i) => {
		const angle = (i / nodes.length) * 2 * Math.PI
		node.x = width / 2 + Math.cos(angle) * Math.min(width, height) * 0.25
		node.y = height / 2 + Math.sin(angle) * Math.min(width, height) * 0.25
		node.radius = NODE_RADIUS
	})

	const k = Math.sqrt((width * height) / (nodes.length + 1)) * 0.6
	const center = { x: width / 2, y: height / 2 }

	for (let iter = 0; iter < iterations; iter++) {
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

		for (const node of nodes) {
			node.x += (center.x - node.x) * 0.02
			node.y += (center.y - node.y) * 0.02
		}

		for (const node of nodes) {
			node.x = Math.max(node.radius, Math.min(width - node.radius, node.x))
			node.y = Math.max(node.radius, Math.min(height - node.radius, node.y))
		}
	}
}

interface BmsAutosarKnowledgeGraphRendererProps {
	nodes: BmsAutosarKnowledgeGraphNode[]
	edges: BmsAutosarKnowledgeGraphEdge[]
	width: number
	height: number
	loading?: boolean
	emptyMessage?: string
	children?: React.ReactNode
}

function sanitizeMermaidId(id: string): string {
	return id.replace(/[^a-zA-Z0-9_]/g, "_").replace(/^[0-9]/, "_$&")
}

function generateMermaid(graph: {
	nodes: BmsAutosarKnowledgeGraphNode[]
	edges: BmsAutosarKnowledgeGraphEdge[]
}): string {
	const idMap = new Map<string, string>()
	const used = new Set<string>()
	graph.nodes.forEach((node, index) => {
		let sanitized = sanitizeMermaidId(node.id)
		if (!sanitized) sanitized = `node${index}`
		let unique = sanitized
		let counter = 1
		while (used.has(unique)) {
			unique = `${sanitized}_${counter++}`
		}
		used.add(unique)
		idMap.set(node.id, unique)
	})

	const lines = ["graph LR"]
	for (const node of graph.nodes) {
		const id = idMap.get(node.id)!
		const label = `${node.type}: ${node.name}`.replace(/"/g, "#quot;")
		lines.push(`    ${id}["${label}"]`)
	}
	for (const edge of graph.edges) {
		const source = idMap.get(edge.source)
		const target = idMap.get(edge.target)
		if (!source || !target) continue
		lines.push(`    ${source} -->|${edge.relation}| ${target}`)
	}
	return lines.join("\n")
}

function downloadBlob(content: string, filename: string, type: string): void {
	const blob = new Blob([content], { type })
	const url = URL.createObjectURL(blob)
	const a = document.createElement("a")
	a.href = url
	a.download = filename
	a.click()
	URL.revokeObjectURL(url)
}

export const BmsAutosarKnowledgeGraphRenderer: React.FC<BmsAutosarKnowledgeGraphRendererProps> = ({
	nodes,
	edges,
	width,
	height,
	loading,
	emptyMessage = "No ARXML graph data available.",
	children,
}) => {
	const svgRef = useRef<SVGSVGElement>(null)
	const [selectedNode, setSelectedNode] = useState<string | null>(null)

	const layoutedNodes = useMemo(() => {
		if (nodes.length === 0) return []
		const graphNodes = nodes.map((n) => ({ ...n, x: 0, y: 0, radius: NODE_RADIUS }))
		simpleForceLayout(graphNodes, edges, width, height)
		return graphNodes
	}, [nodes, edges, width, height])

	const filteredEdges = useMemo(() => {
		if (!selectedNode) return edges
		return edges.filter((e) => e.source === selectedNode || e.target === selectedNode)
	}, [edges, selectedNode])

	const nodeIds = useMemo(() => new Set(layoutedNodes.map((n) => n.id)), [layoutedNodes])
	const visibleEdges = filteredEdges.filter((e) => nodeIds.has(e.source) && nodeIds.has(e.target))

	const handleExportSvg = () => {
		const svg = svgRef.current
		if (!svg) return
		const serializer = new XMLSerializer()
		const source = serializer.serializeToString(svg)
		downloadBlob(source, "arxml-knowledge-graph.svg", "image/svg+xml;charset=utf-8")
	}

	const handleExportMermaid = async () => {
		const mermaid = generateMermaid({ nodes, edges })
		try {
			await navigator.clipboard.writeText(mermaid)
			// eslint-disable-next-line no-alert
			alert("Mermaid definition copied to clipboard.")
		} catch {
			downloadBlob(mermaid, "arxml-knowledge-graph.mmd", "text/plain;charset=utf-8")
		}
	}

	return (
		<div className="flex flex-col h-full">
			<div className="flex items-center gap-2 mb-2 flex-wrap">
				{children}
				<div className="flex-1" />
				<button
					onClick={() => setSelectedNode(null)}
					className={`text-xs px-2 py-1 rounded border ${
						selectedNode === null
							? "bg-[var(--vscode-button-background)] text-[var(--vscode-button-foreground)] border-transparent"
							: "bg-[var(--vscode-editor-background)] text-[var(--vscode-foreground)]"
					}`}>
					All edges
				</button>
				<VSCodeButton appearance="secondary" onClick={handleExportMermaid} disabled={nodes.length === 0}>
					Export Mermaid
				</VSCodeButton>
				<VSCodeButton appearance="secondary" onClick={handleExportSvg} disabled={nodes.length === 0}>
					Export SVG
				</VSCodeButton>
			</div>

			<div
				className="flex-1 border border-[var(--vscode-panel-border)] rounded bg-[var(--vscode-editor-background)] overflow-hidden"
				style={{ minHeight: height }}>
				{loading ? (
					<div className="text-sm text-description py-4 text-center">Building graph...</div>
				) : layoutedNodes.length === 0 ? (
					<div className="text-sm text-description py-4 text-center">{emptyMessage}</div>
				) : (
					<svg ref={svgRef} width={width} height={height}>
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
		</div>
	)
}
