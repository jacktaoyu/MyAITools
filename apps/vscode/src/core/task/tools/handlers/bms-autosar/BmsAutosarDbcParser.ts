/**
 * Lightweight CAN DBC parser for BMS AUTOSAR knowledge import.
 *
 * Parses the most common DBC sections:
 * - `BO_` message definitions
 * - `SG_` signal definitions inside messages
 * - `BA_` attribute assignments
 * - `VAL_` value tables
 *
 * The output is plain text that can be chunked and embedded like any other
 * knowledge entry.
 */

export interface BmsAutosarDbcSignal {
	name: string
	startBit: number
	length: number
	scale: number
	offset: number
	min: number
	max: number
	unit: string
	receivers: string[]
	valueTable?: Map<number, string>
}

export interface BmsAutosarDbcMessage {
	id: number
	name: string
	dlc: number
	sender: string
	signals: BmsAutosarDbcSignal[]
}

export interface BmsAutosarDbc {
	messages: BmsAutosarDbcMessage[]
	attributes: Map<string, Map<string, string | number>>
}

function _parseNumber(value: string): number {
	const trimmed = value.trim()
	if (trimmed.startsWith("0x") || trimmed.startsWith("0X")) {
		return Number.parseInt(trimmed, 16)
	}
	return Number.parseFloat(trimmed)
}

function parseSignalLine(line: string): BmsAutosarDbcSignal | undefined {
	// SG_ SignalName : StartBit|Length@ByteOrder (Signed) (Factor,Offset) [Min|Max] "Unit" Receiver1,Receiver2
	const match = line.match(
		/^SG_\s+(\S+)\s*:\s*(\d+)\|(\d+)@(\d+)\s*\(([+-]?\d+\.?\d*),\s*([+-]?\d+\.?\d*)\)\s*\[([+-]?\d+\.?\d*)\|([+-]?\d+\.?\d*)\]\s*"([^"]*)"\s*(.*)$/,
	)
	if (!match) {
		return undefined
	}

	const receiversText = match[10]?.trim()
	const receivers = receiversText ? receiversText.split(/,\s*/).filter(Boolean) : []

	return {
		name: match[1],
		startBit: Number.parseInt(match[2], 10),
		length: Number.parseInt(match[3], 10),
		scale: Number.parseFloat(match[5]),
		offset: Number.parseFloat(match[6]),
		min: Number.parseFloat(match[7]),
		max: Number.parseFloat(match[8]),
		unit: match[9],
		receivers,
	}
}

function parseMessageLine(line: string): BmsAutosarDbcMessage | undefined {
	// BO_ MessageId MessageName: DLC Sender
	const match = line.match(/^BO_\s+(\d+)\s+(\S+):\s*(\d+)\s+(\S+)\s*$/)
	if (!match) {
		return undefined
	}
	return {
		id: Number.parseInt(match[1], 10),
		name: match[2],
		dlc: Number.parseInt(match[3], 10),
		sender: match[4],
		signals: [],
	}
}

function parseValTableLine(line: string): { signalKey: string; values: Map<number, string> } | undefined {
	// VAL_ MessageId SignalName Value1 "Description1" Value2 "Description2";
	const match = line.match(/^VAL_\s+(\d+)\s+(\S+)\s+(.+);\s*$/)
	if (!match) {
		return undefined
	}
	const valuesText = match[3]
	const values = new Map<number, string>()
	const tokenRegex = /(\d+)\s+"([^"]*)"/g
	for (const tokenMatch of valuesText.matchAll(tokenRegex)) {
		values.set(Number.parseInt(tokenMatch[1], 10), tokenMatch[2])
	}
	return {
		signalKey: `${match[1]}:${match[2]}`,
		values,
	}
}

function parseAttributeLine(line: string): { entity: string; name: string; value: string | number } | undefined {
	// BA_ "AttributeName" [EntityType] [EntityId] value;
	const match = line.match(/^BA_\s+"([^"]+)"(?:\s+(\S+)(?:\s+(\S+))?)?\s+(.+);\s*$/)
	if (!match) {
		return undefined
	}
	const valueText = match[4].trim()
	const numeric = Number(valueText)
	const value = Number.isNaN(numeric) ? valueText : numeric
	const entityParts = [match[2], match[3]].filter(Boolean)
	const entity = entityParts.join(":") || "global"
	return { entity, name: match[1], value }
}

export function parseDbc(content: string): BmsAutosarDbc {
	const lines = content.split(/\r?\n/)
	const messages: BmsAutosarDbcMessage[] = []
	const attributes = new Map<string, Map<string, string | number>>()
	const valueTables = new Map<string, Map<number, string>>()

	let currentMessage: BmsAutosarDbcMessage | undefined

	for (const rawLine of lines) {
		const line = rawLine.trim()
		if (!line || line.startsWith("//")) {
			continue
		}

		if (line.startsWith("BO_ ")) {
			const message = parseMessageLine(line)
			if (message) {
				currentMessage = message
				messages.push(message)
			}
			continue
		}

		if (line.startsWith("SG_ ")) {
			const signal = parseSignalLine(line)
			if (signal) {
				if (currentMessage) {
					currentMessage.signals.push(signal)
				} else {
					// Orphan signal; create a placeholder message so no data is lost.
					messages.push({
						id: 0,
						name: "__orphan__",
						dlc: 0,
						sender: "",
						signals: [signal],
					})
				}
			}
			continue
		}

		if (line.startsWith("VAL_ ")) {
			const valTable = parseValTableLine(line)
			if (valTable) {
				valueTables.set(valTable.signalKey, valTable.values)
			}
			continue
		}

		if (line.startsWith("BA_ ")) {
			const attr = parseAttributeLine(line)
			if (attr) {
				let entityMap = attributes.get(attr.entity)
				if (!entityMap) {
					entityMap = new Map()
					attributes.set(attr.entity, entityMap)
				}
				entityMap.set(attr.name, attr.value)
			}
			continue
		}

		// Any non-signal line resets the current message context.
		if (!line.startsWith("SG_ ")) {
			currentMessage = undefined
		}
	}

	// Attach value tables to signals.
	for (const message of messages) {
		for (const signal of message.signals) {
			const key = `${message.id}:${signal.name}`
			const table = valueTables.get(key)
			if (table) {
				signal.valueTable = table
			}
		}
	}

	return { messages, attributes }
}

function formatSignal(signal: BmsAutosarDbcSignal): string {
	const lines = [
		`  Signal: ${signal.name}`,
		`    StartBit: ${signal.startBit}, Length: ${signal.length}`,
		`    Factor: ${signal.scale}, Offset: ${signal.offset}`,
		`    Range: [${signal.min}, ${signal.max}]`,
	]
	if (signal.unit) {
		lines.push(`    Unit: ${signal.unit}`)
	}
	if (signal.receivers.length > 0) {
		lines.push(`    Receivers: ${signal.receivers.join(", ")}`)
	}
	if (signal.valueTable && signal.valueTable.size > 0) {
		const values = Array.from(signal.valueTable.entries())
			.map(([value, desc]) => `${value}="${desc}"`)
			.join(", ")
		lines.push(`    Values: ${values}`)
	}
	return lines.join("\n")
}

function formatMessage(message: BmsAutosarDbcMessage): string {
	const idHex = `0x${message.id.toString(16).toUpperCase()}`
	const lines = [`Message: ${message.name} (ID=${message.id}/${idHex}, DLC=${message.dlc}, Sender=${message.sender})`]
	for (const signal of message.signals) {
		lines.push(formatSignal(signal))
	}
	return lines.join("\n")
}

/**
 * Converts a parsed DBC into a plain-text representation suitable for
 * embedding and retrieval.
 */
export function dbcToText(dbc: BmsAutosarDbc): string {
	if (dbc.messages.length === 0) {
		return ""
	}
	return dbc.messages.map(formatMessage).join("\n\n")
}

/**
 * Convenience: parse raw DBC content and return one text entry per message.
 */
export function extractDbcEntries(content: string): { topic: string; text: string }[] {
	const dbc = parseDbc(content)
	return dbc.messages
		.filter((message) => message.name !== "__orphan__")
		.map((message) => ({
			topic: message.name,
			text: formatMessage(message),
		}))
}
