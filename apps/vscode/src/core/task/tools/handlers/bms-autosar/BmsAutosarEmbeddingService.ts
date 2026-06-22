import { createHash } from "crypto"
import { Ollama, type Config } from "ollama"
import type { ApiConfiguration } from "@shared/api"
import { createOpenAIClient } from "@/shared/net"
import { Logger } from "@/shared/services/Logger"
import { createConcurrencyLimit } from "@utils/concurrency"

export const DEFAULT_EMBEDDING_MODEL = "text-embedding-3-small"
export const DEFAULT_OLLAMA_EMBEDDING_MODEL = "nomic-embed-text"

const MAX_EMBED_CHARS = 24000

export interface EmbeddingOptions {
	apiConfiguration: ApiConfiguration
	model?: string
}

export interface EmbeddingResult {
	vector: number[]
	model: string
	contentHash: string
}

export function hashContent(content: string): string {
	return createHash("sha256").update(content).digest("hex")
}

function truncateForEmbedding(text: string): string {
	return text.length > MAX_EMBED_CHARS ? text.slice(0, MAX_EMBED_CHARS) : text
}

function canUseOpenAiEmbedding(apiConfiguration: ApiConfiguration): boolean {
	return !!apiConfiguration.openAiApiKey
}

export function canCreateEmbeddings(apiConfiguration: ApiConfiguration): boolean {
	return canUseOpenAiEmbedding(apiConfiguration) || canUseOllamaEmbedding(apiConfiguration)
}

function canUseOllamaEmbedding(apiConfiguration: ApiConfiguration): boolean {
	// Ollama embeddings are a local best-effort fallback. They are only used
	// when no OpenAI-compatible key is configured and the user has configured
	// an Ollama endpoint or model.
	if (canUseOpenAiEmbedding(apiConfiguration)) {
		return false
	}
	return !!(
		apiConfiguration.ollamaBaseUrl ||
		apiConfiguration.actModeOllamaModelId ||
		apiConfiguration.planModeOllamaModelId
	)
}

function getOllamaEmbeddingModel(apiConfiguration: ApiConfiguration): string {
	return apiConfiguration.actModeOllamaModelId || apiConfiguration.planModeOllamaModelId || DEFAULT_OLLAMA_EMBEDDING_MODEL
}

function createOllamaClient(apiConfiguration: ApiConfiguration): Ollama | undefined {
	try {
		const clientOptions: Partial<Config> = {}
		if (apiConfiguration.ollamaBaseUrl) {
			clientOptions.host = apiConfiguration.ollamaBaseUrl
		}
		return new Ollama(clientOptions)
	} catch (error) {
		Logger.error("[BmsAutosarEmbeddingService] Failed to create Ollama client:", error)
		return undefined
	}
}

async function createOllamaEmbeddings(
	texts: string[],
	apiConfiguration: ApiConfiguration,
	model: string,
): Promise<(EmbeddingResult | undefined)[]> {
	const client = createOllamaClient(apiConfiguration)
	if (!client) {
		return texts.map(() => undefined)
	}

	const limit = createConcurrencyLimit(4)
	const results = await Promise.all(
		texts.map(async (text) =>
			limit(async () => {
				const trimmed = text.trim()
				if (!trimmed) {
					return undefined
				}
				try {
					const response = await client.embeddings({
						model,
						prompt: truncateForEmbedding(trimmed),
					})
					const vector = response.embedding
					if (Array.isArray(vector)) {
						return { vector, model, contentHash: hashContent(trimmed) }
					}
					return undefined
				} catch (error) {
					Logger.error("[BmsAutosarEmbeddingService] Ollama embedding failed:", error)
					return undefined
				}
			}),
		),
	)
	return results
}

/**
 * Creates a single embedding vector for the given text using the configured
 * OpenAI-compatible endpoint when available, falling back to a local Ollama
 * embedding model. Returns undefined when no provider is available or the call
 * fails.
 */
export async function createEmbedding(text: string, options: EmbeddingOptions): Promise<EmbeddingResult | undefined> {
	const trimmed = text.trim()
	if (!trimmed) {
		return undefined
	}

	const model = options.model ?? DEFAULT_EMBEDDING_MODEL

	if (canUseOpenAiEmbedding(options.apiConfiguration)) {
		const contentHash = hashContent(trimmed)
		const client = createOpenAIClient({
			baseURL: options.apiConfiguration.openAiBaseUrl,
			apiKey: options.apiConfiguration.openAiApiKey,
			defaultHeaders: options.apiConfiguration.openAiHeaders,
		})

		try {
			const response = await client.embeddings.create({
				model,
				input: truncateForEmbedding(trimmed),
				encoding_format: "float",
			})
			const vector = response.data[0]?.embedding
			if (!vector || !Array.isArray(vector)) {
				return undefined
			}
			return { vector, model, contentHash }
		} catch {
			return undefined
		}
	}

	if (canUseOllamaEmbedding(options.apiConfiguration)) {
		const ollamaModel = getOllamaEmbeddingModel(options.apiConfiguration)
		const results = await createOllamaEmbeddings([trimmed], options.apiConfiguration, ollamaModel)
		return results[0]
	}

	return undefined
}

/**
 * Creates embeddings for multiple texts in a single batch request.
 * Returns undefined for any text that could not be embedded.
 */
export async function createEmbeddings(
	texts: string[],
	options: EmbeddingOptions,
): Promise<(EmbeddingResult | undefined)[]> {
	const model = options.model ?? DEFAULT_EMBEDDING_MODEL
	if (texts.length === 0) {
		return []
	}

	if (canUseOpenAiEmbedding(options.apiConfiguration)) {
		const indexed = texts
			.map((text, index) => ({ text: text.trim(), index }))
			.filter(({ text }) => text.length > 0)

		if (indexed.length === 0) {
			return texts.map(() => undefined)
		}

		const hashes = new Map<number, string>()
		indexed.forEach(({ text, index }) => {
			hashes.set(index, hashContent(text))
		})

		const client = createOpenAIClient({
			baseURL: options.apiConfiguration.openAiBaseUrl,
			apiKey: options.apiConfiguration.openAiApiKey,
			defaultHeaders: options.apiConfiguration.openAiHeaders,
		})

		try {
			const response = await client.embeddings.create({
				model,
				input: indexed.map(({ text }) => truncateForEmbedding(text)),
				encoding_format: "float",
			})

			const results: (EmbeddingResult | undefined)[] = texts.map(() => undefined)
			response.data.forEach((item, idx) => {
				const original = indexed[idx]
				if (original && Array.isArray(item.embedding)) {
					results[original.index] = {
						vector: item.embedding,
						model,
						contentHash: hashes.get(original.index) ?? hashContent(original.text),
					}
				}
			})
			return results
		} catch {
			return texts.map(() => undefined)
		}
	}

	if (canUseOllamaEmbedding(options.apiConfiguration)) {
		const ollamaModel = getOllamaEmbeddingModel(options.apiConfiguration)
		return createOllamaEmbeddings(texts, options.apiConfiguration, ollamaModel)
	}

	return texts.map(() => undefined)
}
