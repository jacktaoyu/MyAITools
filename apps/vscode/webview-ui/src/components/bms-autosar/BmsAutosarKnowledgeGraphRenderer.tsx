import { BmsAutosarKnowledgeGraphEdge, BmsAutosarKnowledgeGraphNode } from "@shared/proto/cline/file"
import { VSCodeButton } from "@vscode/webview-ui-toolkit/react"
import cytoscape from "cytoscape"
import coseBilkent from "cytoscape-cose-bilkent"
import React, { useEffect, useMemo, useRef, useState } from "react"
import { useBmsAutosarNotice } from "./useBmsAutosarNotice"

cytoscape.use(coseBilkent)

export const TYPE_COLORS: Record<string, string> = {
	"COMPOSITION-SW-COMPONENT-TYPE": "#4EC9B0",
	"APPLICATION-SW-COMPONENT-TYPE": "#4EC9B0",
	"SERVICE-SW-COMPONENT-TYPE": "#4EC9B0",
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

const TYPE_RADIUS: Record<string, number> = {
	"COMPOSITION-SW-COMPONENT-TYPE": 26,
	"APPLICATION-SW-COMPONENT-TYPE": 22,
	"SERVICE-SW-COMPONENT-TYPE": 22,
	"AR-PACKAGE": 20,
	"SENDER-RECEIVER-INTERFACE": 16,
	"CLIENT-SERVER-INTERFACE": 16,
	"P-PORT-PROTOTYPE": 12,
	"R-PORT-PROTOTYPE": 12,
	"RUNNABLE-ENTITY": 13,
	"DATA-PROTOTYPE": 10,
	"IMPLEMENTATION-DATA-TYPE": 10,
	"APPLICATION-PRIMITIVE-DATA-TYPE": 10,
	UNKNOWN: 12,
}

const MAX_LABEL_LENGTH = 18

function getNodeRadius(type: string): number {
	return TYPE_RADIUS[type] ?? TYPE_RADIUS.UNKNOWN
}

function getNodeColor(type: string): string {
	return TYPE_COLORS[type] ?? TYPE_COLORS.UNKNOWN
}

function truncateLabel(name: string): string {
	return name.length > MAX_LABEL_LENGTH ? `${name.slice(0, MAX_LABEL_LENGTH - 1)}…` : name
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

function generateMermaid(graph: { nodes: BmsAutosarKnowledgeGraphNode[]; edges: BmsAutosarKnowledgeGraphEdge[] }): string {
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
		const id = idMap.get(node.id) ?? ""
		if (!id) continue
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

function downloadBlob(content: string | Blob, filename: string, type?: string): void {
	const blob = content instanceof Blob ? content : new Blob([content], { type: type ?? "text/plain;charset=utf-8" })
	const url = URL.createObjectURL(blob)
	const a = document.createElement("a")
	a.href = url
	a.download = filename
	a.click()
	URL.revokeObjectURL(url)
}

function getCssVar(name: string, fallback: string): string {
	if (typeof document === "undefined") return fallback
	const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
	return value || fallback
}

const LAYOUT_OPTIONS: { label: string; value: string }[] = [
	{ label: "Force (cose)", value: "cose" },
	{ label: "Force Bilkent", value: "cose-bilkent" },
	{ label: "Grid", value: "grid" },
	{ label: "Circle", value: "circle" },
	{ label: "Concentric", value: "concentric" },
	{ label: "Hierarchical", value: "breadthfirst" },
]

export const BmsAutosarKnowledgeGraphRenderer: React.FC<BmsAutosarKnowledgeGraphRendererProps> = ({
	nodes,
	edges,
	width,
	height,
	loading,
	emptyMessage = "No ARXML graph data available.",
	children,
}) => {
	const containerRef = useRef<HTMLDivElement>(null)
	const cyRef = useRef<cytoscape.Core | null>(null)
	const [selectedNode, setSelectedNode] = useState<string | null>(null)
	const [hoveredNode, setHoveredNode] = useState<string | null>(null)
	const [searchTerm, setSearchTerm] = useState("")
	const [hiddenTypes, setHiddenTypes] = useState<Set<string>>(new Set())
	const [layoutName, setLayoutName] = useState("cose-bilkent")
	const [layoutRunning, setLayoutRunning] = useState(false)
	const { showNotice, noticeElement } = useBmsAutosarNotice(2000)

	const filteredNodes = useMemo(() => {
		const term = searchTerm.trim().toLowerCase()
		return nodes.filter((n) => {
			if (hiddenTypes.has(n.type)) return false
			if (!term) return true
			return (
				n.name.toLowerCase().includes(term) ||
				n.path.toLowerCase().includes(term) ||
				n.id.toLowerCase().includes(term) ||
				n.type.toLowerCase().includes(term)
			)
		})
	}, [nodes, hiddenTypes, searchTerm])

	const filteredNodeIds = useMemo(() => new Set(filteredNodes.map((n) => n.id)), [filteredNodes])
	const filteredEdges = useMemo(
		() => edges.filter((e) => filteredNodeIds.has(e.source) && filteredNodeIds.has(e.target)),
		[edges, filteredNodeIds],
	)

	const typeCounts = useMemo(() => {
		const counts = new Map<string, number>()
		for (const node of nodes) {
			counts.set(node.type, (counts.get(node.type) ?? 0) + 1)
		}
		return Array.from(counts.entries()).sort((a, b) => b[1] - a[1])
	}, [nodes])

	const textColor = useMemo(() => getCssVar("--vscode-foreground", "#cccccc"), [])
	const selectedColor = useMemo(() => getCssVar("--vscode-button-background", "#0e639c"), [])
	const edgeColor = useMemo(() => getCssVar("--vscode-panel-border", "#666666"), [])
	const bgColor = useMemo(() => getCssVar("--vscode-editor-background", "#1e1e1e"), [])

	// Initialize Cytoscape instance once.
	useEffect(() => {
		if (!containerRef.current) return
		const cy = cytoscape({
			container: containerRef.current,
			minZoom: 0.05,
			maxZoom: 4,
			wheelSensitivity: 0.25,
			style: [
				{
					selector: "node",
					style: {
						"background-color": (node: cytoscape.NodeSingular) => node.data("color") as string,
						width: (node: cytoscape.NodeSingular) => node.data("size") as number,
						height: (node: cytoscape.NodeSingular) => node.data("size") as number,
						label: (node: cytoscape.NodeSingular) => node.data("label") as string,
						color: textColor,
						"font-size": "10px",
						"text-valign": "bottom",
						"text-halign": "center",
						"text-margin-y": 4,
						"text-background-color": bgColor,
						"text-background-opacity": 0.85,
						"text-background-padding": "2px",
						"text-background-shape": "roundrectangle",
						"border-width": 1,
						"border-color": "rgba(0,0,0,0.25)",
						"transition-property": "border-width, border-color",
						"transition-duration": 150,
					},
				},
				{
					selector: "node:selected",
					style: {
						"border-width": 4,
						"border-color": selectedColor,
						"z-index": 999,
					},
				},
				{
					selector: "edge",
					style: {
						width: 1,
						"line-color": edgeColor,
						"target-arrow-color": edgeColor,
						"target-arrow-shape": "triangle",
						"arrow-scale": 0.8,
						"curve-style": "bezier",
						opacity: 0.55,
					},
				},
				{
					selector: "edge:selected",
					style: {
						width: 2,
						"line-color": selectedColor,
						"target-arrow-color": selectedColor,
						opacity: 1,
					},
				},
			],
		})

		cy.on("tap", "node", (evt) => {
			const id = evt.target.id()
			setSelectedNode((prev) => (prev === id ? null : id))
		})
		cy.on("tap", (evt) => {
			if (evt.target === cy) setSelectedNode(null)
		})
		cy.on("mouseover", "node", (evt) => setHoveredNode(evt.target.id()))
		cy.on("mouseout", "node", () => setHoveredNode(null))

		cyRef.current = cy
		return () => {
			cy.destroy()
			cyRef.current = null
		}
	}, [textColor, selectedColor, edgeColor, bgColor])

	// Update elements whenever the graph data changes.
	useEffect(() => {
		const cy = cyRef.current
		if (!cy) return

		cy.elements().remove()
		if (filteredNodes.length === 0) return

		const cyNodes = filteredNodes.map((node) => ({
			data: {
				id: node.id,
				label: truncateLabel(node.name),
				fullLabel: node.name,
				type: node.type,
				path: node.path,
				color: getNodeColor(node.type),
				size: getNodeRadius(node.type) * 2,
			},
		}))

		const cyEdges = filteredEdges.map((edge, index) => ({
			data: {
				id: `${edge.source}->${edge.target}-${index}`,
				source: edge.source,
				target: edge.target,
				relation: edge.relation,
			},
		}))

		cy.add([...cyNodes, ...cyEdges])

		if (selectedNode && filteredNodeIds.has(selectedNode)) {
			cy.getElementById(selectedNode).select()
		} else {
			setSelectedNode(null)
		}

		setLayoutRunning(true)
		let layout: cytoscape.Layouts
		if (layoutName === "cose-bilkent") {
			layout = cy.layout({
				name: "cose-bilkent",
				animate: false,
				randomize: true,
				componentSpacing: 80,
				nodeRepulsion: 400000,
				edgeElasticity: 0.45,
				nestingFactor: 0.1,
				gravity: 0.25,
				numIter: 2500,
				tile: true,
				tilingPaddingVertical: 12,
				tilingPaddingHorizontal: 12,
				gravityRangeCompound: 1.5,
				gravityCompound: 1.0,
				gravityRange: 3.8,
				idealEdgeLength: 70,
			} as cytoscape.LayoutOptions)
		} else {
			layout = cy.layout({ name: layoutName } as cytoscape.LayoutOptions)
		}

		layout.one("layoutstop", () => {
			cy.fit(undefined, 40)
			setLayoutRunning(false)
		})
		layout.run()
	}, [filteredNodes, filteredEdges, filteredNodeIds, layoutName, selectedNode, textColor])

	// Resize when dimensions change.
	useEffect(() => {
		cyRef.current?.resize()
	}, [width, height])

	const toggleType = (type: string) => {
		setHiddenTypes((prev) => {
			const next = new Set(prev)
			if (next.has(type)) next.delete(type)
			else next.add(type)
			return next
		})
	}

	const handleZoomIn = () => cyRef.current?.zoom(cyRef.current.zoom() * 1.2)
	const handleZoomOut = () => cyRef.current?.zoom(cyRef.current.zoom() * 0.83)
	const handleFit = () => cyRef.current?.fit(undefined, 40)

	const handleExportPng = () => {
		const cy = cyRef.current
		if (!cy) return
		const png = cy.png({ full: true, bg: bgColor, scale: 2 })
		downloadBlob(png, "arxml-knowledge-graph.png", "image/png")
	}

	const handleExportMermaid = async () => {
		const mermaid = generateMermaid({ nodes, edges })
		try {
			await navigator.clipboard.writeText(mermaid)
			showNotice("Mermaid definition copied to clipboard.", "success")
		} catch {
			downloadBlob(mermaid, "arxml-knowledge-graph.mmd", "text/plain;charset=utf-8")
		}
	}

	const selectedPath = useMemo(
		() => filteredNodes.find((n) => n.id === selectedNode)?.path,
		[filteredNodes, selectedNode],
	)

	return (
		<div className="flex flex-col h-full">
			<div className="flex items-center gap-2 mb-2 flex-wrap">
				{children}
				<div className="flex-1" />
				<input
					className="text-xs px-2 py-1 rounded border bg-[var(--vscode-editor-background)] text-[var(--vscode-foreground)]"
					placeholder="Search nodes..."
					style={{ minWidth: "140px" }}
					type="text"
					value={searchTerm}
					onChange={(e) => setSearchTerm(e.target.value)}
				/>
				<select
					className="text-xs px-2 py-1 rounded border bg-[var(--vscode-editor-background)] text-[var(--vscode-foreground)]"
					value={layoutName}
					onChange={(e) => setLayoutName(e.target.value)}>
					{LAYOUT_OPTIONS.map((opt) => (
						<option key={opt.value} value={opt.value}>
							{opt.label}
						</option>
					))}
				</select>
				<button
					className="text-xs px-2 py-1 rounded border bg-[var(--vscode-editor-background)] text-[var(--vscode-foreground)]"
					onClick={() => setSelectedNode(null)}
					type="button">
					Clear selection
				</button>
				<VSCodeButton appearance="secondary" disabled={filteredNodes.length === 0} onClick={handleZoomIn}>
					<i className="codicon codicon-zoom-in" style={{ fontSize: "12.5px" }} />
				</VSCodeButton>
				<VSCodeButton appearance="secondary" disabled={filteredNodes.length === 0} onClick={handleZoomOut}>
					<i className="codicon codicon-zoom-out" style={{ fontSize: "12.5px" }} />
				</VSCodeButton>
				<VSCodeButton appearance="secondary" disabled={filteredNodes.length === 0} onClick={handleFit}>
					<i className="codicon codicon-screen-normal" style={{ fontSize: "12.5px" }} />
				</VSCodeButton>
				<VSCodeButton appearance="secondary" disabled={nodes.length === 0} onClick={handleExportMermaid}>
					Export Mermaid
				</VSCodeButton>
				<VSCodeButton appearance="secondary" disabled={filteredNodes.length === 0} onClick={handleExportPng}>
					Export PNG
				</VSCodeButton>
			</div>

			{typeCounts.length > 0 && (
				<div className="flex flex-wrap gap-2 mb-2">
					{typeCounts.map(([type, count]) => {
						const hidden = hiddenTypes.has(type)
						return (
							<button
								key={type}
								className={`flex items-center gap-1.5 text-xs px-2 py-1 rounded border transition-opacity ${
									hidden ? "opacity-40" : "opacity-100"
								}`}
								style={{
									backgroundColor: "var(--vscode-editor-background)",
									borderColor: "var(--vscode-panel-border)",
									color: "var(--vscode-foreground)",
								}}
								onClick={() => toggleType(type)}
								type="button">
								<span
									className="inline-block rounded-full"
									style={{ width: 10, height: 10, backgroundColor: getNodeColor(type) }}
								/>
								<span className={hidden ? "line-through" : undefined}>{type}</span>
								<span className="text-[var(--vscode-descriptionForeground)]">({count})</span>
							</button>
						)
					})}
				</div>
			)}

			<div
				className="flex-1 border border-[var(--vscode-panel-border)] rounded bg-[var(--vscode-editor-background)] overflow-hidden relative"
				style={{ minHeight: height }}>
				{loading || layoutRunning ? (
					<div className="absolute inset-0 flex items-center justify-center text-sm text-[var(--vscode-descriptionForeground)]">
						Building graph...
					</div>
				) : filteredNodes.length === 0 ? (
					<div className="absolute inset-0 flex items-center justify-center text-sm text-[var(--vscode-descriptionForeground)]">
						{emptyMessage}
					</div>
				) : null}
				<div
					ref={containerRef}
					className="w-full h-full"
					style={{ width: "100%", height: "100%", visibility: loading || layoutRunning ? "hidden" : "visible" }}
				/>
				{hoveredNode && (
					<div className="absolute bottom-2 left-2 text-xs px-2 py-1 rounded border bg-[var(--vscode-editor-background)] text-[var(--vscode-foreground)] border-[var(--vscode-panel-border)]">
						{filteredNodes.find((n) => n.id === hoveredNode)?.path}
					</div>
				)}
			</div>

			{selectedPath && (
				<div className="mt-2 text-xs text-[var(--vscode-descriptionForeground)] truncate">Selected: {selectedPath}</div>
			)}
			{noticeElement}
		</div>
	)
}

export default BmsAutosarKnowledgeGraphRenderer
