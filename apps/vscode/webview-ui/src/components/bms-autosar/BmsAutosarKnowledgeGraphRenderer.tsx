import { BmsAutosarKnowledgeGraphEdge, BmsAutosarKnowledgeGraphNode } from "@shared/proto/cline/file"
import { VSCodeButton } from "@vscode/webview-ui-toolkit/react"
import React, { useEffect, useMemo, useRef, useState } from "react"
import { useBmsAutosarNotice } from "./useBmsAutosarNotice"

interface GraphNode extends BmsAutosarKnowledgeGraphNode {
	x: number
	y: number
	radius: number
}

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
const LABEL_FONT_SIZE = 9
const LABEL_PADDING_X = 4
const LABEL_PADDING_Y = 2

function getNodeRadius(type: string): number {
	return TYPE_RADIUS[type] ?? TYPE_RADIUS.UNKNOWN
}

function getNodeColor(type: string): string {
	return TYPE_COLORS[type] ?? TYPE_COLORS.UNKNOWN
}

function groupByType(nodes: GraphNode[]): Map<string, GraphNode[]> {
	const groups = new Map<string, GraphNode[]>()
	for (const node of nodes) {
		const list = groups.get(node.type) ?? []
		list.push(node)
		groups.set(node.type, list)
	}
	return groups
}

function layoutGraph(nodes: GraphNode[], edges: BmsAutosarKnowledgeGraphEdge[], width: number, height: number): void {
	if (nodes.length === 0) return

	const center = { x: width / 2, y: height / 2 }
	const area = width * height
	const k = Math.sqrt(area / (nodes.length + 1)) * 1.3
	const typeGroups = groupByType(nodes)
	const types = Array.from(typeGroups.keys())
	const groupRingRadius = Math.min(width, height) * 0.38

	const groupCenters = new Map<string, { x: number; y: number }>()
	for (let i = 0; i < types.length; i++) {
		const angle = (i / types.length) * 2 * Math.PI
		groupCenters.set(types[i], {
			x: center.x + Math.cos(angle) * groupRingRadius,
			y: center.y + Math.sin(angle) * groupRingRadius,
		})
	}

	// Initialize nodes near their type cluster center in a small grid.
	for (const [type, group] of typeGroups) {
		const gc = groupCenters.get(type) ?? center
		const cols = Math.max(1, Math.ceil(Math.sqrt(group.length)))
		const spacing = 32
		for (let i = 0; i < group.length; i++) {
			const row = Math.floor(i / cols)
			const col = i % cols
			group[i].x = gc.x + (col - cols / 2) * spacing
			group[i].y = gc.y + (row - cols / 2) * spacing
		}
	}

	const indexById = new Map<string, number>()
	for (let i = 0; i < nodes.length; i++) {
		indexById.set(nodes[i].id, i)
	}

	const edgePairs: Array<[number, number]> = []
	for (const edge of edges) {
		const s = indexById.get(edge.source)
		const t = indexById.get(edge.target)
		if (s !== undefined && t !== undefined) {
			edgePairs.push([s, t])
		}
	}

	const velocities = nodes.map(() => ({ x: 0, y: 0 }))
	const maxIterations = Math.min(300, Math.max(100, nodes.length * 2))
	let temperature = Math.min(width, height) / 10
	const cooling = 0.97

	const left = 40
	const right = width - 40
	const top = 40
	const bottom = height - 40

	for (let iter = 0; iter < maxIterations; iter++) {
		// Repulsion
		for (let i = 0; i < nodes.length; i++) {
			for (let j = i + 1; j < nodes.length; j++) {
				const a = nodes[i]
				const b = nodes[j]
				let dx = a.x - b.x
				let dy = a.y - b.y
				const dist = Math.sqrt(dx * dx + dy * dy) || 1
				if (dist < k * 3) {
					const force = (k * k) / dist
					dx = (dx / dist) * force * 0.5
					dy = (dy / dist) * force * 0.5
					velocities[i].x += dx
					velocities[i].y += dy
					velocities[j].x -= dx
					velocities[j].y -= dy
				}
			}
		}

		// Edge attraction
		for (const [si, ti] of edgePairs) {
			const source = nodes[si]
			const target = nodes[ti]
			let dx = target.x - source.x
			let dy = target.y - source.y
			const dist = Math.sqrt(dx * dx + dy * dy) || 1
			const ideal = source.radius + target.radius + 40
			const force = (dist - ideal) * 0.025
			dx = (dx / dist) * force
			dy = (dy / dist) * force
			velocities[si].x += dx
			velocities[si].y += dy
			velocities[ti].x -= dx
			velocities[ti].y -= dy
		}

		// Attraction to type cluster center
		for (let i = 0; i < nodes.length; i++) {
			const node = nodes[i]
			const gc = groupCenters.get(node.type)
			if (!gc) continue
			velocities[i].x += (gc.x - node.x) * 0.03
			velocities[i].y += (gc.y - node.y) * 0.03
		}

		// Weak global gravity
		for (let i = 0; i < nodes.length; i++) {
			const node = nodes[i]
			velocities[i].x += (center.x - node.x) * 0.005
			velocities[i].y += (center.y - node.y) * 0.005
		}

		// Apply velocities
		for (let i = 0; i < nodes.length; i++) {
			const node = nodes[i]
			node.x += velocities[i].x * temperature
			node.y += velocities[i].y * temperature
			velocities[i].x *= 0.65
			velocities[i].y *= 0.65
		}

		// Collision resolution
		for (let pass = 0; pass < 4; pass++) {
			for (let i = 0; i < nodes.length; i++) {
				for (let j = i + 1; j < nodes.length; j++) {
					const a = nodes[i]
					const b = nodes[j]
					let dx = a.x - b.x
					let dy = a.y - b.y
					const dist = Math.sqrt(dx * dx + dy * dy) || 0
					const minDist = a.radius + b.radius + 6
					if (dist < minDist) {
						let nx = 0
						let ny = 0
						if (dist === 0) {
							nx = 1
							ny = 0
						} else {
							nx = dx / dist
							ny = dy / dist
						}
						const overlap = (minDist - dist) / 2 + 1
						a.x += nx * overlap
						a.y += ny * overlap
						b.x -= nx * overlap
						b.y -= ny * overlap
					}
				}
			}
		}

		// Keep inside padded bounds
		for (const node of nodes) {
			node.x = Math.max(left + node.radius, Math.min(right - node.radius, node.x))
			node.y = Math.max(top + node.radius, Math.min(bottom - node.radius, node.y))
		}

		temperature *= cooling
	}

	// Final collision cleanup
	for (let pass = 0; pass < 12; pass++) {
		for (let i = 0; i < nodes.length; i++) {
			for (let j = i + 1; j < nodes.length; j++) {
				const a = nodes[i]
				const b = nodes[j]
				let dx = a.x - b.x
				let dy = a.y - b.y
				const dist = Math.sqrt(dx * dx + dy * dy) || 0
				const minDist = a.radius + b.radius + 4
				if (dist < minDist) {
					let nx = 0
					let ny = 0
					if (dist === 0) {
						nx = 1
						ny = 0
					} else {
						nx = dx / dist
						ny = dy / dist
					}
					const overlap = (minDist - dist) / 2 + 0.5
					a.x += nx * overlap
					a.y += ny * overlap
					b.x -= nx * overlap
					b.y -= ny * overlap
				}
			}
		}
	}

	// Final bounds clamp
	for (const node of nodes) {
		node.x = Math.max(node.radius, Math.min(width - node.radius, node.x))
		node.y = Math.max(node.radius, Math.min(height - node.radius, node.y))
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

function downloadBlob(content: string, filename: string, type: string): void {
	const blob = new Blob([content], { type })
	const url = URL.createObjectURL(blob)
	const a = document.createElement("a")
	a.href = url
	a.download = filename
	a.click()
	URL.revokeObjectURL(url)
}

interface Transform {
	x: number
	y: number
	k: number
}

function clamp(value: number, min: number, max: number): number {
	return Math.max(min, Math.min(max, value))
}

function fitGraph(nodes: GraphNode[], width: number, height: number, padding = 40): Transform {
	if (nodes.length === 0) return { x: 0, y: 0, k: 1 }
	let minX = Infinity
	let minY = Infinity
	let maxX = -Infinity
	let maxY = -Infinity
	for (const node of nodes) {
		minX = Math.min(minX, node.x - node.radius)
		minY = Math.min(minY, node.y - node.radius)
		maxX = Math.max(maxX, node.x + node.radius)
		maxY = Math.max(maxY, node.y + node.radius)
	}
	const graphW = maxX - minX
	const graphH = maxY - minY
	if (graphW === 0 || graphH === 0) return { x: 0, y: 0, k: 1 }
	const scale = Math.min((width - padding * 2) / graphW, (height - padding * 2) / graphH, 1.5)
	const x = (width - (minX + maxX) * scale) / 2
	const y = (height - (minY + maxY) * scale) / 2
	return { x, y, k: scale }
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
	const [hoveredNode, setHoveredNode] = useState<string | null>(null)
	const [transform, setTransform] = useState<Transform>({ x: 0, y: 0, k: 1 })
	const [dragging, setDragging] = useState(false)
	const dragStartRef = useRef<{ x: number; y: number } | null>(null)
	const { showNotice, noticeElement } = useBmsAutosarNotice(2000)
	const [searchTerm, setSearchTerm] = useState("")
	const [hiddenTypes, setHiddenTypes] = useState<Set<string>>(new Set())

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

	const layoutedNodes = useMemo(() => {
		if (filteredNodes.length === 0) return []
		const graphNodes = filteredNodes.map((n) => ({ ...n, x: 0, y: 0, radius: getNodeRadius(n.type) }))
		layoutGraph(graphNodes, filteredEdges, width, height)
		return graphNodes
	}, [filteredNodes, filteredEdges, width, height])

	// Auto-fit when the graph changes.
	useEffect(() => {
		setTransform(fitGraph(layoutedNodes, width, height))
		setSelectedNode(null)
	}, [layoutedNodes, width, height])

	const handleZoom = (scaleFactor: number, centerX?: number, centerY?: number) => {
		setTransform((prev) => {
			const newK = clamp(prev.k * scaleFactor, 0.1, 5)
			if (newK === prev.k) return prev
			const cx = centerX ?? width / 2
			const cy = centerY ?? height / 2
			const wx = (cx - prev.x) / prev.k
			const wy = (cy - prev.y) / prev.k
			return {
				k: newK,
				x: cx - wx * newK,
				y: cy - wy * newK,
			}
		})
	}

	const handleWheel = (event: React.WheelEvent<SVGSVGElement>) => {
		event.preventDefault()
		const svg = svgRef.current
		if (!svg) return
		const point = svg.createSVGPoint()
		point.x = event.clientX
		point.y = event.clientY
		const svgPoint = point.matrixTransform(svg.getScreenCTM()?.inverse())
		const scaleFactor = event.deltaY < 0 ? 1.15 : 0.87
		handleZoom(scaleFactor, svgPoint.x, svgPoint.y)
	}

	const handleMouseDown = (event: React.MouseEvent<SVGSVGElement>) => {
		if (event.button !== 0) return
		setDragging(true)
		dragStartRef.current = { x: event.clientX - transform.x, y: event.clientY - transform.y }
	}

	const handleMouseMove = (event: React.MouseEvent<SVGSVGElement>) => {
		if (!dragging || !dragStartRef.current) return
		setTransform((prev) => ({
			...prev,
			x: event.clientX - dragStartRef.current!.x,
			y: event.clientY - dragStartRef.current!.y,
		}))
	}

	const handleMouseUp = () => {
		setDragging(false)
		dragStartRef.current = null
	}

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
			showNotice("Mermaid definition copied to clipboard.", "success")
		} catch {
			downloadBlob(mermaid, "arxml-knowledge-graph.mmd", "text/plain;charset=utf-8")
		}
	}

	const resetView = () => setTransform(fitGraph(layoutedNodes, width, height))

	const typeCounts = useMemo(() => {
		const counts = new Map<string, number>()
		for (const node of nodes) {
			counts.set(node.type, (counts.get(node.type) ?? 0) + 1)
		}
		return Array.from(counts.entries()).sort((a, b) => b[1] - a[1])
	}, [nodes])

	const toggleType = (type: string) => {
		setHiddenTypes((prev) => {
			const next = new Set(prev)
			if (next.has(type)) next.delete(type)
			else next.add(type)
			return next
		})
	}

	const showAllLabels = layoutedNodes.length <= 35 || transform.k > 1.2

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
				<button
					className={`text-xs px-2 py-1 rounded border ${
						selectedNode === null
							? "bg-[var(--vscode-button-background)] text-[var(--vscode-button-foreground)] border-transparent"
							: "bg-[var(--vscode-editor-background)] text-[var(--vscode-foreground)]"
					}`}
					onClick={() => setSelectedNode(null)}
					type="button">
					All edges
				</button>
				<VSCodeButton appearance="secondary" disabled={layoutedNodes.length === 0} onClick={() => handleZoom(1.2)}>
					<i className="codicon codicon-zoom-in" style={{ fontSize: "12.5px" }} />
				</VSCodeButton>
				<VSCodeButton appearance="secondary" disabled={layoutedNodes.length === 0} onClick={() => handleZoom(0.83)}>
					<i className="codicon codicon-zoom-out" style={{ fontSize: "12.5px" }} />
				</VSCodeButton>
				<VSCodeButton appearance="secondary" disabled={layoutedNodes.length === 0} onClick={resetView}>
					<i className="codicon codicon-screen-normal" style={{ fontSize: "12.5px" }} />
				</VSCodeButton>
				<VSCodeButton appearance="secondary" disabled={nodes.length === 0} onClick={handleExportMermaid}>
					Export Mermaid
				</VSCodeButton>
				<VSCodeButton appearance="secondary" disabled={layoutedNodes.length === 0} onClick={handleExportSvg}>
					Export SVG
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
				className="flex-1 border border-[var(--vscode-panel-border)] rounded bg-[var(--vscode-editor-background)] overflow-hidden"
				style={{ minHeight: height }}>
				{loading ? (
					<div className="text-sm text-description py-4 text-center">Building graph...</div>
				) : layoutedNodes.length === 0 ? (
					<div className="text-sm text-description py-4 text-center">{emptyMessage}</div>
				) : (
					<svg
						aria-label="ARXML knowledge graph"
						className={dragging ? "cursor-grabbing" : "cursor-grab"}
						height={height}
						onMouseDown={handleMouseDown}
						onMouseLeave={handleMouseUp}
						onMouseMove={handleMouseMove}
						onMouseUp={handleMouseUp}
						onWheel={handleWheel}
						ref={svgRef}
						role="img"
						width={width}>
						<title>ARXML knowledge graph</title>
						<defs>
							<marker id="arrowhead" markerHeight="7" markerWidth="10" orient="auto" refX="20" refY="3.5">
								<polygon fill="var(--vscode-panel-border)" points="0 0, 10 3.5, 0 7" />
							</marker>
						</defs>
						<g transform={`translate(${transform.x}, ${transform.y}) scale(${transform.k})`}>
							{filteredEdges.map((edge, i) => {
								const source = layoutedNodes.find((n) => n.id === edge.source)
								const target = layoutedNodes.find((n) => n.id === edge.target)
								if (!source || !target) return null
								const isSelected = selectedNode && (edge.source === selectedNode || edge.target === selectedNode)
								const opacity = selectedNode ? (isSelected ? 1 : 0.15) : 0.5
								return (
									<line
										key={`${edge.source}-${edge.target}-${i}`}
										markerEnd="url(#arrowhead)"
										opacity={opacity}
										stroke="var(--vscode-panel-border)"
										strokeWidth={isSelected ? 2 : 1}
										x1={source.x}
										x2={target.x}
										y1={source.y}
										y2={target.y}
									/>
								)
							})}
							{layoutedNodes.map((node) => {
								const isSelected = selectedNode === node.id
								const isHovered = hoveredNode === node.id
								const showLabel = showAllLabels || isSelected || isHovered
								const label =
									node.name.length > MAX_LABEL_LENGTH ? `${node.name.slice(0, MAX_LABEL_LENGTH - 1)}…` : node.name
								const labelWidth = label.length * 5.6 + LABEL_PADDING_X * 2
								const labelHeight = LABEL_FONT_SIZE + LABEL_PADDING_Y * 2
								const dimmed = selectedNode && !isSelected && !isHovered
								return (
									// biome-ignore lint/a11y/useSemanticElements: SVG node group cannot be a <button>
									<g
										aria-label={`${node.type} ${node.name}`}
										className="cursor-pointer"
										key={node.id}
										opacity={dimmed ? 0.35 : 1}
										role="button"
										tabIndex={0}
										transform={`translate(${node.x}, ${node.y})`}
										onClick={() => setSelectedNode(isSelected ? null : node.id)}
										onKeyDown={(event) => {
											if (event.key === "Enter" || event.key === " ") {
												setSelectedNode(isSelected ? null : node.id)
											}
										}}
										onMouseEnter={() => setHoveredNode(node.id)}
										onMouseLeave={() => setHoveredNode((prev) => (prev === node.id ? null : prev))}>
										<circle
											fill={getNodeColor(node.type)}
											r={node.radius}
											stroke={isSelected ? "var(--vscode-button-background)" : "rgba(0,0,0,0.2)"}
											strokeWidth={isSelected ? 3 : 1}
										/>
										{showLabel && (
											<g transform={`translate(0, ${node.radius + 10})`}>
												<rect
													height={labelHeight}
													fill="var(--vscode-editor-background)"
													opacity={0.85}
													rx={3}
													width={labelWidth}
													x={-labelWidth / 2}
													y={-labelHeight / 2}
												/>
												<text
													className="fill-[var(--vscode-foreground)] pointer-events-none"
													style={{
														fontFamily: "var(--vscode-font-family)",
														fontSize: `${LABEL_FONT_SIZE}px`,
													}}
													textAnchor="middle"
													dy="0.35em">
													{label}
												</text>
											</g>
										)}
										<title>{`${node.type}: ${node.path}`}</title>
									</g>
								)
							})}
						</g>
					</svg>
				)}
			</div>
			{selectedNode && (
				<div className="mt-2 text-xs text-[var(--vscode-descriptionForeground)]">
					Selected: {layoutedNodes.find((n) => n.id === selectedNode)?.path}
				</div>
			)}
			{noticeElement}
		</div>
	)
}

export default BmsAutosarKnowledgeGraphRenderer
