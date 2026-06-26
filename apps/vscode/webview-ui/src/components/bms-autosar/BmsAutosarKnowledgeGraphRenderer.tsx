import {
	BmsAutosarExternalEdge,
	BmsAutosarExternalNode,
	BmsAutosarKnowledgeGraphEdge,
	BmsAutosarKnowledgeGraphNode,
	OpenArxmlSourceRequest,
} from "@shared/proto/cline/file"
import { BooleanRequest, StringRequest } from "@shared/proto/cline/common"
import { VSCodeButton } from "@vscode/webview-ui-toolkit/react"
import cytoscape from "cytoscape"
import coseBilkent from "cytoscape-cose-bilkent"
import dagre from "cytoscape-dagre"
import React, { useEffect, useMemo, useRef, useState } from "react"
import { FileServiceClient } from "@/services/grpc-client"
import { useBmsAutosarNotice } from "./useBmsAutosarNotice"

cytoscape.use(coseBilkent)
cytoscape.use(dagre)

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
	"CAN-SIGNAL": "#FFA500",
	"EXCEL-INTERFACE": "#9C89B8",
	"EXCEL-PARAMETER": "#B28DFF",
	"SIMULINK-DATA": "#FF69B4",
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
	"CAN-SIGNAL": 11,
	"EXCEL-INTERFACE": 11,
	"EXCEL-PARAMETER": 11,
	"SIMULINK-DATA": 11,
	UNKNOWN: 12,
}

const RELATION_COLORS: Record<string, string> = {
	contains: "#6e6e6e",
	provides: "#4EC9B0",
	requires: "#9CDCFE",
	implements: "#CE9178",
	references: "#DCDCAA",
	triggers: "#C586C0",
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
	{ label: "Hierarchical (dagre)", value: "dagre" },
	{ label: "Grid", value: "grid" },
	{ label: "Circle", value: "circle" },
	{ label: "Concentric", value: "concentric" },
	{ label: "Breadthfirst", value: "breadthfirst" },
]

function buildCytoscapeElements(
	nodes: Array<BmsAutosarKnowledgeGraphNode | BmsAutosarExternalNode>,
	edges: Array<BmsAutosarKnowledgeGraphEdge | BmsAutosarExternalEdge>,
) {
	const nodeEles = nodes.map((node) => {
		const isExternal = !("packagePath" in node)
		return {
			data: {
				id: node.id,
				name: node.name,
				label: truncateLabel(node.name),
				fullLabel: node.name,
				type: node.type,
				color: getNodeColor(node.type),
				size: getNodeRadius(node.type) * 2,
				metadata: isExternal ? (node as BmsAutosarExternalNode).metadata : undefined,
				sourceFile: isExternal ? (node as BmsAutosarExternalNode).sourceFile : (node as BmsAutosarKnowledgeGraphNode).sourceFile,
				line: isExternal ? undefined : (node as BmsAutosarKnowledgeGraphNode).line,
			},
		}
	})
	const edgeEles = edges.map((edge, index) => ({
		data: {
			id: `${edge.source}->${edge.target}-${index}`,
			source: edge.source,
			target: edge.target,
			relation: edge.relation,
			external: !("source" in edge && typeof edge.source === "string" && edge.source.startsWith("AR-PACKAGE:")),
		},
	}))
	return [...nodeEles, ...edgeEles]
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
	const containerRef = useRef<HTMLDivElement>(null)
	const cyRef = useRef<cytoscape.Core | null>(null)
	const [selectedNode, setSelectedNode] = useState<string | null>(null)
	const [hoveredNode, setHoveredNode] = useState<string | null>(null)
	const [searchTerm, setSearchTerm] = useState("")
	const [hiddenTypes, setHiddenTypes] = useState<Set<string>>(new Set())
	const [hiddenRelations, setHiddenRelations] = useState<Set<string>>(new Set())
	const [layoutName, setLayoutName] = useState("dagre")
	const [layoutRunning, setLayoutRunning] = useState(false)
	const [externalNodes, setExternalNodes] = useState<BmsAutosarExternalNode[]>([])
	const [externalEdges, setExternalEdges] = useState<BmsAutosarExternalEdge[]>([])
	const { showNotice, noticeElement } = useBmsAutosarNotice(2000)

	const allNodes = useMemo<Array<BmsAutosarKnowledgeGraphNode | BmsAutosarExternalNode>>(
		() => [...nodes, ...externalNodes],
		[nodes, externalNodes],
	)
	const allEdges = useMemo<Array<BmsAutosarKnowledgeGraphEdge | BmsAutosarExternalEdge>>(
		() => [...edges, ...externalEdges],
		[edges, externalEdges],
	)

	const filteredNodes = useMemo(() => {
		const term = searchTerm.trim().toLowerCase()
		return allNodes.filter((n) => {
			if (hiddenTypes.has(n.type)) return false
			if (!term) return true
			return (
				n.name.toLowerCase().includes(term) ||
				("path" in n && n.path.toLowerCase().includes(term)) ||
				n.id.toLowerCase().includes(term) ||
				n.type.toLowerCase().includes(term)
			)
		})
	}, [allNodes, hiddenTypes, searchTerm])

	const filteredNodeIds = useMemo(() => new Set(filteredNodes.map((n) => n.id)), [filteredNodes])
	const filteredEdges = useMemo(
		() =>
			allEdges.filter(
				(e) =>
					filteredNodeIds.has(e.source) &&
					filteredNodeIds.has(e.target) &&
					!hiddenRelations.has(e.relation),
			),
		[allEdges, filteredNodeIds, hiddenRelations],
	)

	const typeCounts = useMemo(() => {
		const counts = new Map<string, number>()
		for (const node of allNodes) {
			counts.set(node.type, (counts.get(node.type) ?? 0) + 1)
		}
		return Array.from(counts.entries()).sort((a, b) => b[1] - a[1])
	}, [allNodes])

	const relationCounts = useMemo(() => {
		const counts = new Map<string, number>()
		for (const edge of allEdges) {
			counts.set(edge.relation, (counts.get(edge.relation) ?? 0) + 1)
		}
		return Array.from(counts.entries()).sort((a, b) => b[1] - a[1])
	}, [allEdges])

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
						"background-color": "data(color)",
						width: "data(size)",
						height: "data(size)",
						label: "data(label)",
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
					selector: ":parent",
					style: {
						"background-opacity": 0.04,
						"background-color": edgeColor,
						"border-width": 1,
						"border-color": edgeColor,
						"border-opacity": 0.5,
						padding: "12px",
						label: "data(name)",
						color: textColor,
						"font-size": "10px",
						"text-valign": "top",
						"text-halign": "center",
						"text-margin-y": 4,
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
						"line-color": (edge: cytoscape.EdgeSingular) => RELATION_COLORS[edge.data("relation")] || edgeColor,
						"target-arrow-color": (edge: cytoscape.EdgeSingular) =>
							RELATION_COLORS[edge.data("relation")] || edgeColor,
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
		cy.on("dbltap", "node", async (evt) => {
			const sourceFile = evt.target.data("sourceFile") as string | undefined
			const line = (evt.target.data("line") as number | undefined) ?? 1
			if (sourceFile && line > 0) {
				try {
					await FileServiceClient.openArxmlSource(OpenArxmlSourceRequest.create({ filePath: sourceFile, line }))
				} catch (error) {
					console.error("Failed to open ARXML source:", error)
				}
			}
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
		if (filteredNodes.length === 0) {
			setLayoutRunning(false)
			return
		}

		const elements = buildCytoscapeElements(filteredNodes, filteredEdges)
		cy.add(elements)

		if (selectedNode && filteredNodeIds.has(selectedNode)) {
			cy.getElementById(selectedNode).select()
		} else {
			setSelectedNode(null)
		}

		setLayoutRunning(true)
		let rafId: number
		let aborted = false

		const finishLayout = (usedLayoutName: string) => () => {
			if (aborted) return
			cy.resize()
			const bbox = cy.elements().boundingBox()
			const bboxArea = bbox.w * bbox.h
			console.log(
				`[ARXML Graph] layout=${usedLayoutName} nodes=${filteredNodes.length} edges=${filteredEdges.length} bbox=${bbox.w.toFixed(1)}x${bbox.h.toFixed(1)} area=${bboxArea.toFixed(1)}`,
			)
			if (bboxArea < 10000 || bbox.w < 50 || bbox.h < 50) {
				console.warn("[ARXML Graph] layout collapsed, falling back to grid")
				const fallback = cy.layout({ name: "grid", fit: true, padding: 40 } as cytoscape.LayoutOptions)
				fallback.one("layoutstop", () => {
					cy.fit(undefined, 40)
					setLayoutRunning(false)
				})
				fallback.run()
				return
			}
			cy.fit(undefined, 40)
			setLayoutRunning(false)
		}

		const runLayout = () => {
			if (aborted) return
			cy.resize()

			let layout: cytoscape.Layouts
			if (layoutName === "cose-bilkent") {
				layout = cy.layout({
					name: "cose-bilkent",
					animate: false,
					randomize: true,
					componentSpacing: 100,
					nodeRepulsion: 450000,
					edgeElasticity: 0.45,
					nestingFactor: 0.1,
					gravity: 0.25,
					numIter: 2500,
					tile: false,
					tilingPaddingVertical: 16,
					tilingPaddingHorizontal: 16,
					gravityRangeCompound: 1.5,
					gravityCompound: 1.0,
					gravityRange: 3.8,
					idealEdgeLength: 80,
					nodeDimensionsIncludeLabels: false,
					fit: false,
				} as cytoscape.LayoutOptions)
			} else if (layoutName === "dagre") {
				layout = cy.layout({
					name: "dagre",
					animate: false,
					rankDir: "LR",
					nodeSep: 50,
					edgeSep: 12,
					rankSep: 90,
					padding: 20,
					fit: false,
				} as cytoscape.LayoutOptions)
			} else {
				layout = cy.layout({ name: layoutName, fit: false } as cytoscape.LayoutOptions)
			}

			layout.one("layoutstop", finishLayout(layoutName))
			layout.run()
		}

		rafId = requestAnimationFrame(runLayout)

		return () => {
			aborted = true
			cancelAnimationFrame(rafId)
		}
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

	const toggleRelation = (relation: string) => {
		setHiddenRelations((prev) => {
			const next = new Set(prev)
			if (next.has(relation)) next.delete(relation)
			else next.add(relation)
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

	const autoLinkExternalNodes = (
		newExternalNodes: BmsAutosarExternalNode[],
		arxmlNodes: BmsAutosarKnowledgeGraphNode[],
	): BmsAutosarExternalEdge[] => {
		const arxmlByName = new Map<string, BmsAutosarKnowledgeGraphNode[]>()
		for (const node of arxmlNodes) {
			const key = node.name.toLowerCase()
			const list = arxmlByName.get(key) ?? []
			list.push(node)
			arxmlByName.set(key, list)
		}

		const newEdges: BmsAutosarExternalEdge[] = []
		for (const ext of newExternalNodes) {
			const candidates = arxmlByName.get(ext.name.toLowerCase())
			if (!candidates) continue
			for (const target of candidates.slice(0, 3)) {
				newEdges.push(
					BmsAutosarExternalEdge.create({
						source: ext.id,
						target: target.id,
						relation: "references",
					}),
				)
			}
		}
		return newEdges
	}

	const loadExternalSource = async (parser: "dbc" | "excel" | "simulink") => {
		try {
			const picker = await FileServiceClient.selectFiles(BooleanRequest.create({ value: false }))
			const paths = picker.values2 ?? []
			if (paths.length === 0) return

			const filePath = paths[0]
			let response: { nodes: BmsAutosarExternalNode[]; edges: BmsAutosarExternalEdge[] }
			if (parser === "dbc") {
				response = await FileServiceClient.parseBmsAutosarDbc(StringRequest.create({ value: filePath }))
			} else if (parser === "excel") {
				response = await FileServiceClient.parseBmsAutosarExcel(StringRequest.create({ value: filePath }))
			} else {
				response = await FileServiceClient.parseBmsAutosarSimulinkData(StringRequest.create({ value: filePath }))
			}

			const newNodes = response.nodes
			const newEdges = autoLinkExternalNodes(newNodes, nodes)
			setExternalNodes((prev) => [...prev, ...newNodes])
			setExternalEdges((prev) => [...prev, ...newEdges])
			showNotice(`Linked ${newNodes.length} ${parser} nodes.`, "success")
		} catch (error) {
			console.error(`Failed to load ${parser}:`, error)
			showNotice(`Failed to load ${parser} data.`, "error")
		}
	}

	const clearExternal = () => {
		setExternalNodes([])
		setExternalEdges([])
	}

	const selectedNodeData = useMemo(
		() => filteredNodes.find((n) => n.id === selectedNode),
		[filteredNodes, selectedNode],
	)

	const breadcrumbParts = useMemo(() => {
		if (!selectedNodeData || !("packagePath" in selectedNodeData)) return []
		return selectedNodeData.packagePath.split("/").filter(Boolean)
	}, [selectedNodeData])

	const selectPackage = (packagePath: string) => {
		const id = `AR-PACKAGE:${packagePath}`
		if (filteredNodeIds.has(id)) {
			setSelectedNode(id)
			cyRef.current?.getElementById(id).select()
			cyRef.current?.fit(cyRef.current.getElementById(id), 20)
		}
	}

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
				<VSCodeButton appearance="secondary" onClick={() => loadExternalSource("dbc")}>
					Link DBC
				</VSCodeButton>
				<VSCodeButton appearance="secondary" onClick={() => loadExternalSource("excel")}>
					Link Excel
				</VSCodeButton>
				<VSCodeButton appearance="secondary" onClick={() => loadExternalSource("simulink")}>
					Link Simulink
				</VSCodeButton>
				{externalNodes.length > 0 && (
					<VSCodeButton appearance="icon" aria-label="Clear external data" onClick={clearExternal}>
						<i className="codicon codicon-clear-all" style={{ fontSize: "12.5px" }} />
					</VSCodeButton>
				)}
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

			{relationCounts.length > 0 && (
				<div className="flex flex-wrap gap-2 mb-2">
					{relationCounts.map(([relation, count]) => {
						const hidden = hiddenRelations.has(relation)
						return (
							<button
								key={relation}
								className={`flex items-center gap-1.5 text-xs px-2 py-1 rounded border transition-opacity ${
									hidden ? "opacity-40" : "opacity-100"
								}`}
								style={{
									backgroundColor: "var(--vscode-editor-background)",
									borderColor: "var(--vscode-panel-border)",
									color: "var(--vscode-foreground)",
								}}
								onClick={() => toggleRelation(relation)}
								type="button">
								<span
									className="inline-block rounded-full"
									style={{ width: 10, height: 10, backgroundColor: RELATION_COLORS[relation] || edgeColor }}
								/>
								<span className={hidden ? "line-through" : undefined}>{relation}</span>
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
					style={{
						width: "100%",
						height: "100%",
						opacity: loading || layoutRunning ? 0 : 1,
						pointerEvents: loading || layoutRunning ? "none" : "auto",
						transition: "opacity 150ms ease",
					}}
				/>
				{hoveredNode && (
					<div className="absolute bottom-2 left-2 text-xs px-2 py-1 rounded border bg-[var(--vscode-editor-background)] text-[var(--vscode-foreground)] border-[var(--vscode-panel-border)] max-w-md truncate">
						{(() => {
							const node = filteredNodes.find((n) => n.id === hoveredNode)
							if (!node) return null
							const metadata = "metadata" in node ? node.metadata : undefined
							return (
								<div>
									<div className="font-medium">
										{node.name} ({node.type})
									</div>
									{"path" in node && <div className="opacity-80">{node.path}</div>}
									{metadata && <div className="opacity-70">{metadata}</div>}
								</div>
							)
						})()}
					</div>
				)}
			</div>

			{selectedNodeData && (
				<div className="mt-2 text-xs text-[var(--vscode-descriptionForeground)]">
					<div className="flex items-center gap-1 flex-wrap">
						<span>Selected:</span>
						{breadcrumbParts.length > 0 &&
							breadcrumbParts.map((part, index) => {
								const packagePath = breadcrumbParts.slice(0, index + 1).join("/")
								return (
									<React.Fragment key={packagePath}>
										<button
											className="hover:underline text-[var(--vscode-foreground)]"
											onClick={() => selectPackage(packagePath)}
											type="button">
											{part}
										</button>
										{index < breadcrumbParts.length - 1 && <span>/</span>}
									</React.Fragment>
								)
							})}
						<span className="text-[var(--vscode-foreground)]">{selectedNodeData.name}</span>
						<span className="text-[var(--vscode-descriptionForeground)]">({selectedNodeData.type})</span>
					</div>
					{"path" in selectedNodeData && <div className="truncate mt-0.5">{selectedNodeData.path}</div>}
					{selectedNodeData.sourceFile && ("line" in selectedNodeData ? selectedNodeData.line : 0) > 0 && (
						<div className="truncate text-[var(--vscode-descriptionForeground)]">
							{selectedNodeData.sourceFile.split(/[/\\]/).pop()}:{
								"line" in selectedNodeData ? selectedNodeData.line : "?"} — double-click to open
						</div>
					)}
				</div>
			)}
			{noticeElement}
		</div>
	)
}

export default BmsAutosarKnowledgeGraphRenderer
