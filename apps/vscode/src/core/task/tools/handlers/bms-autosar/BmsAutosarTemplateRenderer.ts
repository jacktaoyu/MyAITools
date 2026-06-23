export interface BmsAutosarPort {
	name: string
	interface_type: "S/R" | "C/S"
	direction: "provided" | "required"
	data_type: string
}

export interface BmsAutosarRunnable {
	name: string
	event: "TimingEvent" | "DataReceivedEvent" | "OperationInvokedEvent"
	period_ms?: number
}

export interface BmsAutosarTemplate {
	component_type: string
	default_ports: BmsAutosarPort[]
	default_runnables: BmsAutosarRunnable[]
	header_template: string
	c_template: string
	arxml_template: string
}

export interface BmsAutosarTemplates {
	version: string
	templates: Record<string, BmsAutosarTemplate>
}

export interface BmsAutosarTemplateContext {
	ComponentName: string
	COMPONENT_NAME: string
	component_name: string
	WorkspaceName: string
	ports: Array<BmsAutosarPort & Record<string, unknown>>
	runnables: Array<BmsAutosarRunnable & Record<string, unknown>>
	[key: string]: unknown
}

function isTruthy(value: unknown): boolean {
	if (Array.isArray(value)) {
		return value.length > 0
	}
	return Boolean(value)
}

type BlockType = "each" | "if" | "unless"

interface ParsedBlock {
	type: BlockType
	name: string
	body: string
}

const BLOCK_START_REGEX = /\{\{#(each|if|unless)\s+(\w+)\}\}/
const BLOCK_END_REGEX = /\{\{\/(each|if|unless)\}\}/

/**
 * Find the index of the closing tag that matches the opening tag at `startIndex`.
 * Uses a simple stack to support nested blocks of the same type.
 */
function findMatchingClose(template: string, startIndex: number, blockType: BlockType): number {
	let depth = 1
	let index = startIndex
	while (index < template.length) {
		const remaining = template.slice(index)
		const startMatch = BLOCK_START_REGEX.exec(remaining)
		const endMatch = BLOCK_END_REGEX.exec(remaining)

		const startPos = startMatch ? index + startMatch.index : Number.POSITIVE_INFINITY
		const endPos = endMatch ? index + endMatch.index : Number.POSITIVE_INFINITY

		if (endPos === Number.POSITIVE_INFINITY) {
			// No closing tag found; return end of string to avoid infinite loop.
			return template.length
		}

		if (startPos < endPos) {
			// Found another opening tag of the same type; increase depth.
			if (startMatch && startMatch[1] === blockType) {
				depth++
			}
			index = startPos + (startMatch ? startMatch[0].length : 0)
		} else {
			// Found a closing tag.
			if (endMatch && endMatch[1] === blockType) {
				depth--
				if (depth === 0) {
					return endPos
				}
			}
			index = endPos + (endMatch ? endMatch[0].length : 0)
		}
	}

	return template.length
}

/**
 * Parse a template into an array of text segments and blocks.
 */
function parseTemplate(template: string): Array<string | ParsedBlock> {
	const segments: Array<string | ParsedBlock> = []
	let index = 0

	while (index < template.length) {
		const remaining = template.slice(index)
		const match = BLOCK_START_REGEX.exec(remaining)

		if (!match) {
			segments.push(remaining)
			break
		}

		if (match.index > 0) {
			segments.push(remaining.slice(0, match.index))
		}

		const blockType = match[1] as BlockType
		const blockName = match[2]
		const bodyStart = index + match.index + match[0].length
		const closeStart = findMatchingClose(template, bodyStart, blockType)
		const body = template.slice(bodyStart, closeStart)

		segments.push({ type: blockType, name: blockName, body })

		const closeMatch = BLOCK_END_REGEX.exec(template.slice(closeStart))
		index = closeStart + (closeMatch ? closeMatch[0].length : 0)
	}

	return segments
}

/**
 * Lightweight template renderer for BMS AUTOSAR blueprints.
 *
 * Supports:
 * - Simple variable substitution: `${ComponentName}`, `${name}`, etc.
 * - Loops: `{{#each ports}} ... {{/each}}` (including nested loops)
 * - Conditionals: `{{#if ports}} ... {{/if}}`, `{{#unless ports}} ... {{/unless}}`
 *
 * Inside a loop, item properties are merged into the context and exposed as
 * `${name}`, `${interface_type}`, etc. A `${$index}` counter is also available.
 */
export function renderTemplate(template: string, context: BmsAutosarTemplateContext): string {
	const segments = parseTemplate(template)

	return segments
		.map((segment) => {
			if (typeof segment === "string") {
				return segment.replace(/\$\{([\w$]+)\}/g, (match, varName) => {
					const value = context[varName]
					return value !== undefined && value !== null ? String(value) : match
				})
			}

			if (segment.type === "each") {
				const list = context[segment.name]
				if (!Array.isArray(list)) {
					return ""
				}
				return list
					.map((item, index) => {
						const itemContext = { ...context, ...item, $index: index }
						return renderTemplate(segment.body, itemContext as BmsAutosarTemplateContext)
					})
					.join("")
			}

			if (segment.type === "if") {
				return isTruthy(context[segment.name]) ? renderTemplate(segment.body, context) : ""
			}

			if (segment.type === "unless") {
				return isTruthy(context[segment.name]) ? "" : renderTemplate(segment.body, context)
			}

			return ""
		})
		.join("")
}
