/**
 * Lightweight AUTOSAR ARXML knowledge graph builder.
 *
 * Parses ARXML content into nodes (packages, components, ports, interfaces,
 * data types, runnables) and edges (contains, provides, requires, references)
 * so that knowledge retrieval can walk relationships instead of only matching
 * text.
 */

export type ArxmlNodeType =
	| "AR-PACKAGE"
	| "APPLICATION-SW-COMPONENT-TYPE"
	| "SERVICE-SW-COMPONENT-TYPE"
	| "COMPOSITION-SW-COMPONENT-TYPE"
	| "BSW-MODULE-DESCRIPTION"
	| "P-PORT-PROTOTYPE"
	| "R-PORT-PROTOTYPE"
	| "SENDER-RECEIVER-INTERFACE"
	| "CLIENT-SERVER-INTERFACE"
	| "IMPLEMENTATION-DATA-TYPE"
	| "APPLICATION-PRIMITIVE-DATA-TYPE"
	| "RUNNABLE-ENTITY"
	| "DATA-PROTOTYPE"
	| "UNKNOWN"

export interface ArxmlNode {
	id: string
	type: ArxmlNodeType
	name: string
	path: string
	packagePath: string
}

export interface ArxmlEdge {
	source: string
	target: string
	relation: "contains" | "provides" | "requires" | "implements" | "references" | "triggers"
}

export interface ArxmlGraph {
	nodes: Map<string, ArxmlNode>
	edges: ArxmlEdge[]
}

const NODE_TYPE_MAP: Record<string, ArxmlNodeType> = {
	"AR-PACKAGE": "AR-PACKAGE",
	"APPLICATION-SW-COMPONENT-TYPE": "APPLICATION-SW-COMPONENT-TYPE",
	"SERVICE-SW-COMPONENT-TYPE": "SERVICE-SW-COMPONENT-TYPE",
	"COMPOSITION-SW-COMPONENT-TYPE": "COMPOSITION-SW-COMPONENT-TYPE",
	"BSW-MODULE-DESCRIPTION": "BSW-MODULE-DESCRIPTION",
	"P-PORT-PROTOTYPE": "P-PORT-PROTOTYPE",
	"R-PORT-PROTOTYPE": "R-PORT-PROTOTYPE",
	"SENDER-RECEIVER-INTERFACE": "SENDER-RECEIVER-INTERFACE",
	"CLIENT-SERVER-INTERFACE": "CLIENT-SERVER-INTERFACE",
	"IMPLEMENTATION-DATA-TYPE": "IMPLEMENTATION-DATA-TYPE",
	"APPLICATION-PRIMITIVE-DATA-TYPE": "APPLICATION-PRIMITIVE-DATA-TYPE",
	"RUNNABLE-ENTITY": "RUNNABLE-ENTITY",
	"VARIABLE-DATA-PROTOTYPE": "DATA-PROTOTYPE",
	"PARAMETER-DATA-PROTOTYPE": "DATA-PROTOTYPE",
	"DATA-ELEMENT-PROTOTYPE": "DATA-PROTOTYPE",
}

const INTERESTING_TAGS = new Set(Object.keys(NODE_TYPE_MAP))

interface ShortNameMatch {
	name: string
	offset: number
	parentTag: string
	parentOffset: number
}

/**
 * Find the opening tag that directly contains the character at `offset`.
 * Returns the tag name and its offset, or undefined if none is found.
 */
function findParentTag(xml: string, offset: number): { tag: string; offset: number } | undefined {
	const textBefore = xml.slice(0, offset)
	const tagRegex = /<(\/?)([A-Za-z_][\w:-]*)\b[^>]*?\/?>/g
	const tags: { tag: string; isOpen: boolean; index: number }[] = []
	let match: RegExpExecArray | null
	while ((match = tagRegex.exec(textBefore)) !== null) {
		const isOpen = match[1] !== "/"
		const tag = match[2]
		tags.push({ tag, isOpen, index: match.index })
	}

	const stack: string[] = []
	for (let i = tags.length - 1; i >= 0; i--) {
		const { tag, isOpen } = tags[i]
		if (isOpen) {
			if (stack.length > 0 && stack[stack.length - 1] === tag) {
				stack.pop()
			} else {
				return { tag, offset: tags[i].index }
			}
		} else {
			stack.push(tag)
		}
	}
	return undefined
}

/**
 * Walk up the XML tree from `offset` until an interesting tag is found.
 */
function findInterestingAncestorTag(xml: string, offset: number): { tag: string; offset: number } | undefined {
	let current = findParentTag(xml, offset)
	while (current) {
		if (INTERESTING_TAGS.has(current.tag)) {
			return current
		}
		current = findParentTag(xml, current.offset)
	}
	return undefined
}

/**
 * Extract all SHORT-NAME elements with their containing parent tag.
 */
function extractShortNames(content: string): ShortNameMatch[] {
	const results: ShortNameMatch[] = []
	const regex = /<SHORT-NAME\b[^>]*>([^<]+)<\/SHORT-NAME>/g
	let match: RegExpExecArray | null
	while ((match = regex.exec(content)) !== null) {
		const parent = findParentTag(content, match.index)
		if (!parent) continue
		results.push({
			name: match[1].trim(),
			offset: match.index,
			parentTag: parent.tag,
			parentOffset: parent.offset,
		})
	}
	return results
}

/**
 * Build a path-like identifier for an ARXML element.
 *
 * The path is built from the chain of SHORT-NAMEs whose parent tags are
 * AR-PACKAGE, followed by the element's own SHORT-NAME. This yields stable
 * identifiers suitable for a knowledge graph.
 */
function buildElementPath(shortNames: ShortNameMatch[], ownMatch: ShortNameMatch): string {
	const packageParts: string[] = []
	for (const sn of shortNames) {
		if (sn.offset < ownMatch.offset && sn.parentTag === "AR-PACKAGE") {
			packageParts.push(sn.name)
		}
	}
	const prefix = packageParts.length > 0 ? packageParts.join("/") + "/" : ""
	return `${prefix}${ownMatch.name}`
}

function derivePackagePath(pathStr: string): string {
	const parts = pathStr.split("/")
	parts.pop()
	return parts.join("/")
}

function parseAttrs(attrString: string): Record<string, string> {
	const attrs: Record<string, string> = {}
	const regex = /(\w+)\s*=\s*"([^"]*)"/g
	let match: RegExpExecArray | null
	while ((match = regex.exec(attrString)) !== null) {
		attrs[match[1]] = match[2]
	}
	return attrs
}

function inferRefTargetType(tag: string, dest?: string): ArxmlNodeType {
	if (dest) {
		const mapped = NODE_TYPE_MAP[dest]
		if (mapped) return mapped
	}
	switch (tag) {
		case "TYPE-TREF":
		case "DATA-TYPE-TREF":
			return "IMPLEMENTATION-DATA-TYPE"
		case "INTERFACE-TREF":
		case "REQUIRED-INTERFACE-TREF":
		case "PROVIDED-INTERFACE-TREF":
			return "SENDER-RECEIVER-INTERFACE"
		case "COMPONENT-TREF":
			return "APPLICATION-SW-COMPONENT-TYPE"
		case "START-ON-EVENT-REF":
			return "RUNNABLE-ENTITY"
		default:
			return "UNKNOWN"
	}
}

function inferRelation(tag: string): ArxmlEdge["relation"] {
	if (tag.includes("PROVIDED") || tag.startsWith("P-")) return "provides"
	if (tag.includes("REQUIRED") || tag.startsWith("R-")) return "requires"
	if (tag === "START-ON-EVENT-REF") return "triggers"
	return "references"
}

/**
 * Parse ARXML text into a graph of AUTOSAR elements.
 *
 * The parser is intentionally regex-based so it can handle large ARXML files
 * without pulling in a full XML DOM library. It focuses on the element types
 * most relevant for BMS AUTOSAR code generation.
 */
export function buildArxmlKnowledgeGraph(content: string): ArxmlGraph {
	const graph: ArxmlGraph = { nodes: new Map(), edges: [] }
	if (!content || content.trim().length === 0) {
		return graph
	}

	const shortNames = extractShortNames(content)

	// Map parent offset -> SHORT-NAME match for interesting tags.
	const elementByParentOffset = new Map<number, ShortNameMatch>()
	for (const sn of shortNames) {
		if (INTERESTING_TAGS.has(sn.parentTag)) {
			elementByParentOffset.set(sn.parentOffset, sn)
		}
	}

	// Create nodes for interesting elements.
	for (const sn of shortNames) {
		if (!INTERESTING_TAGS.has(sn.parentTag)) continue
		const nodeType = NODE_TYPE_MAP[sn.parentTag]
		const pathStr = buildElementPath(shortNames, sn)
		const packagePath = derivePackagePath(pathStr)
		const id = `${nodeType}:${pathStr}`
		if (!graph.nodes.has(id)) {
			graph.nodes.set(id, {
				id,
				type: nodeType,
				name: sn.name,
				path: pathStr,
				packagePath,
			})
		}
	}

	// Build contains edges by walking up to the nearest interesting ancestor.
	for (const child of shortNames) {
		if (!INTERESTING_TAGS.has(child.parentTag)) continue
		const childId = `${NODE_TYPE_MAP[child.parentTag]}:${buildElementPath(shortNames, child)}`
		const ancestor = findInterestingAncestorTag(content, child.parentOffset)
		if (!ancestor) continue
		const parentSn = elementByParentOffset.get(ancestor.offset)
		if (!parentSn) continue
		const parentId = `${NODE_TYPE_MAP[parentSn.parentTag]}:${buildElementPath(shortNames, parentSn)}`
		if (parentId !== childId) {
			graph.edges.push({ source: parentId, target: childId, relation: "contains" })
		}
	}

	// Extract reference edges from TREF/REF elements.
	const refRegex = /<(TYPE-TREF|DATA-TYPE-TREF|INTERFACE-TREF|REQUIRED-INTERFACE-TREF|PROVIDED-INTERFACE-TREF|COMPONENT-TREF|SOFTWARE-COMPOSITION-TREF|START-ON-EVENT-REF)\b([^>]*)>([^<]*)<\/\1>/g
	let match: RegExpExecArray | null
	while ((match = refRegex.exec(content)) !== null) {
		const tagName = match[1]
		const attrs = parseAttrs(match[2])
		const refPath = match[3].trim()
		if (!refPath) continue

		const parent = findInterestingAncestorTag(content, match.index)
		if (!parent) continue

		const parentSn = elementByParentOffset.get(parent.offset)
		if (!parentSn) continue

		const sourceId = `${NODE_TYPE_MAP[parentSn.parentTag]}:${buildElementPath(shortNames, parentSn)}`
		const targetType = inferRefTargetType(tagName, attrs.DEST)
		const targetId = resolveReferenceTarget(graph, targetType, refPath)
		graph.edges.push({ source: sourceId, target: targetId, relation: inferRelation(tagName) })
	}

	return graph
}

/**
 * Resolve a TREF/REF path to a graph node id. When the referenced element is
 * present in the graph, its full path id is returned so edges connect actual
 * nodes. Otherwise a synthetic id is returned.
 */
function resolveReferenceTarget(graph: ArxmlGraph, targetType: ArxmlNodeType, refPath: string): string {
	const targetName = refPath.split("/").pop() || refPath
	const fullPath = refPath.startsWith("/") ? refPath.slice(1) : refPath
	for (const node of graph.nodes.values()) {
		if (node.type === targetType && (node.path === fullPath || node.path.endsWith(`/${targetName}`) || node.name === targetName)) {
			return node.id
		}
	}
	return `${targetType}:${targetName}`
}

/**
 * Find graph nodes whose name or path contains the query text.
 */
export function searchGraphNodes(graph: ArxmlGraph, query: string): ArxmlNode[] {
	const lower = query.toLowerCase()
	const matches: ArxmlNode[] = []
	for (const node of graph.nodes.values()) {
		if (node.name.toLowerCase().includes(lower) || node.path.toLowerCase().includes(lower)) {
			matches.push(node)
		}
	}
	return matches
}

/**
 * Collect related nodes up to a given hop distance from a starting node.
 */
export function getRelatedNodes(graph: ArxmlGraph, nodeId: string, maxHops = 2): Map<string, number> {
	const distances = new Map<string, number>()
	const queue: Array<{ id: string; hops: number }> = [{ id: nodeId, hops: 0 }]
	distances.set(nodeId, 0)

	while (queue.length > 0) {
		const current = queue.shift()!
		if (current.hops >= maxHops) continue

		for (const edge of graph.edges) {
			const neighbor = edge.source === current.id ? edge.target : edge.target === current.id ? edge.source : undefined
			if (!neighbor || distances.has(neighbor)) continue
			distances.set(neighbor, current.hops + 1)
			queue.push({ id: neighbor, hops: current.hops + 1 })
		}
	}

	return distances
}

/**
 * Rank ARXML knowledge entries using the graph: entries whose topics/names are
 * close to query-matched nodes receive a boost.
 */
export function rankByGraphProximity(
	graph: ArxmlGraph,
	entries: Array<{ topic: string; content?: string }>,
	query: string,
	boostPerHop = 0.25,
	maxHops = 2,
): Map<number, number> {
	const scores = new Map<number, number>()
	const matchedNodes = searchGraphNodes(graph, query)
	if (matchedNodes.length === 0) {
		return scores
	}

	const nodeBoosts = new Map<string, number>()
	for (const node of matchedNodes) {
		nodeBoosts.set(node.id, 1)
		const related = getRelatedNodes(graph, node.id, maxHops)
		for (const [relatedId, hops] of related.entries()) {
			const boost = 1 - hops * boostPerHop
			if (boost > 0) {
				nodeBoosts.set(relatedId, Math.max(nodeBoosts.get(relatedId) ?? 0, boost))
			}
		}
	}

	for (let i = 0; i < entries.length; i++) {
		const entry = entries[i]
		const text = `${entry.topic} ${entry.content || ""}`.toLowerCase()
		let bestBoost = 0
		for (const node of graph.nodes.values()) {
			if (text.includes(node.name.toLowerCase()) || text.includes(node.path.toLowerCase())) {
				bestBoost = Math.max(bestBoost, nodeBoosts.get(node.id) ?? 0)
			}
		}
		if (bestBoost > 0) {
			scores.set(i, bestBoost)
		}
	}

	return scores
}
