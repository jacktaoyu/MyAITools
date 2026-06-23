export interface BmsAutosarKnowledgeEmbedding {
	model: string
	vector: number[]
	contentHash: string
}

export interface BmsAutosarKnowledgeLocation {
	path?: string
	page?: number
	chapter?: string
}

export interface BmsAutosarKnowledgeEntry {
	topic: string
	content: string
	createdAt: string
	updatedAt: string
	tags?: string[]
	/** Files that contributed to this entry (e.g. folder import sources). */
	sourceFiles?: string[]
	embedding?: BmsAutosarKnowledgeEmbedding
	/** Primary source file path for this entry (relative or absolute). */
	sourcePath?: string
	/** SHA-256 of the source file content. */
	sourceHash?: string
	/** Source file mtime in milliseconds. */
	sourceMtimeMs?: number
	/** Source file size in bytes. */
	sourceSize?: number
	/** Optional page/chapter locations (e.g. PDF page or DOCX heading). */
	locations?: BmsAutosarKnowledgeLocation[]
}

export interface BmsAutosarKnowledgeFile {
	version: string
	entries: BmsAutosarKnowledgeEntry[]
}

export interface BmsAutosarKnowledgeSource {
	path: string
	entries: BmsAutosarKnowledgeEntry[]
}

export function suggestBmsAutosarTags(topic: string, content: string): string[] {
	const text = `${topic} ${content}`.toLowerCase()
	const tags = new Set<string>()

	const keywordTags: [RegExp, string][] = [
		[/\bautosar/, "autosar"],
		[/\barxml/, "arxml"],
		[/\bmisra/, "misra"],
		[/\bswc\b|\bapplication/, "swc"],
		[/\bbsw\b|\bmodule/, "bsw"],
		[/\brte\b|\binterface/, "rte"],
		[/\bcell|\bvoltage|\btemperature/, "cell"],
		[/\bbalanc|\bequalization/, "balancing"],
		[/\bthermal|\bcooling|\bheating/, "thermal"],
		[/\bcharger|\bcharging|\bcc\/cv/, "charger"],
		[/\bdiagnosis|\bdtc\b|\bfault|\bdem\b/, "diagnosis"],
		[/\bcontroller|\bcontactor|\bhv\b/, "controller"],
		[/\bsoc\b|\bsoh\b|\bstate\b/, "state-estimation"],
		[/\bsafety|\basil|\biso26262/, "safety"],
	]

	for (const [regex, tag] of keywordTags) {
		if (regex.test(text)) {
			tags.add(tag)
		}
	}

	return Array.from(tags).sort()
}

export const MAX_CHUNK_CHARS = 4000

/**
 * Splits a large extracted text into paragraph-oriented chunks. ARXML-like
 * content is split on structural closing tags when possible; otherwise the
 * text is split on blank lines, then line boundaries, then hard character
 * limits. Each chunk is kept under `maxChunkChars`.
 */
export function chunkBmsAutosarText(text: string, maxChunkChars = MAX_CHUNK_CHARS): string[] {
	const trimmed = text.trim()
	if (trimmed.length <= maxChunkChars) {
		return [trimmed]
	}

	// For ARXML-like content, prefer splitting at major closing elements.
	const isArxml = trimmed.startsWith("<") && /<AUTOSAR|<SHORT-NAME/i.test(trimmed)
	const splits = isArxml
		? trimmed.split(/(?=<\/AR-PACKAGE>|<\/SW-COMPONENT-TYPE>|<\/BSW-MODULE-DESCRIPTION>|<\/ELEMENT>)/)
		: trimmed.split(/\n\s*\n/)

	const chunks: string[] = []
	let current = ""

	function flush(force = false) {
		if (current.length >= maxChunkChars || (force && current.length > 0)) {
			chunks.push(current.trim())
			current = ""
		}
	}

	for (const part of splits) {
		const trimmedPart = part.trim()
		if (!trimmedPart) {
			continue
		}
		if (trimmedPart.length > maxChunkChars) {
			// Flush what we have before slicing the oversized part.
			flush(true)
			const lines = trimmedPart.split("\n")
			for (const line of lines) {
				if ((current + line).length > maxChunkChars) {
					flush(true)
				}
				if (line.length > maxChunkChars) {
					for (let i = 0; i < line.length; i += maxChunkChars) {
						chunks.push(line.slice(i, i + maxChunkChars).trim())
					}
				} else {
					current += (current ? "\n" : "") + line
				}
			}
		} else if (`${current}\n${trimmedPart}`.length > maxChunkChars) {
			flush(true)
			current = trimmedPart
		} else {
			current += (current ? "\n\n" : "") + trimmedPart
		}
	}

	flush(true)
	return chunks.length > 0 ? chunks : [trimmed.slice(0, maxChunkChars)]
}
