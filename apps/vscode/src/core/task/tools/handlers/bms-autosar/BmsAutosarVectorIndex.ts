import fs from "node:fs/promises"
import path from "node:path"
import { HierarchicalNSW } from "hnswlib-node"
import { getClineHomePath } from "@/core/storage/disk"
import { fileExistsAtPath } from "@utils/fs"
import type { ApiConfiguration } from "@shared/api"
import { createEmbeddings, DEFAULT_EMBEDDING_MODEL, type EmbeddingOptions, hashContent } from "./BmsAutosarEmbeddingService"
import { loadVectorCached, saveVectorCached } from "./BmsAutosarKnowledgeCache"
import type { BmsAutosarKnowledgeEntry } from "./BmsAutosarKnowledgeTypes"

export interface BmsAutosarVectorIndexSearchResult {
	entryIndex: number
	score: number
}

interface VectorIndexManifest {
	entriesHash: string
	model: string
	count: number
	dimensions: number
	createdAt: string
}

function getVectorIndexDir(): string {
	return path.join(getClineHomePath(), "bms-autosar", "cache", "vector-index")
}

async function ensureVectorIndexDir(): Promise<string> {
	const dir = getVectorIndexDir()
	await fs.mkdir(dir, { recursive: true })
	return dir
}

function safeModelName(model: string): string {
	return model.replace(/[^a-zA-Z0-9_-]/g, "_")
}

function computeEntriesHash(entries: BmsAutosarKnowledgeEntry[]): string {
	const parts = entries.map((entry) => hashContent(entry.content))
	return hashContent(parts.join("\n"))
}

async function getEntryVectors(
	entries: BmsAutosarKnowledgeEntry[],
	model: string,
	embeddingOptions: EmbeddingOptions,
): Promise<Array<{ vector: number[]; entryIndex: number }>> {
	const results: Array<{ vector: number[]; entryIndex: number }> = []
	const missing: Array<{ entry: BmsAutosarKnowledgeEntry; entryIndex: number }> = []

	await Promise.all(
		entries.map(async (entry, entryIndex) => {
			const contentHash = hashContent(entry.content)
			const cached = await loadVectorCached(contentHash, model)
			if (cached) {
				results.push({ vector: cached, entryIndex })
			} else {
				missing.push({ entry, entryIndex })
			}
		}),
	)

	if (missing.length > 0) {
		const embeddings = await createEmbeddings(
			missing.map((m) => m.entry.content),
			embeddingOptions,
		)
		for (let i = 0; i < missing.length; i++) {
			const embedding = embeddings[i]
			if (!embedding) {
				continue
			}
			const { entry, entryIndex } = missing[i]
			const contentHash = hashContent(entry.content)
			await saveVectorCached(contentHash, model, embedding.vector)
			results.push({ vector: embedding.vector, entryIndex })
		}
	}

	return results.sort((a, b) => a.entryIndex - b.entryIndex)
}

export class BmsAutosarVectorIndex {
	private index?: HierarchicalNSW
	private manifest?: VectorIndexManifest
	private entriesHash?: string
	private readonly indexPath: string
	private readonly manifestPath: string

	constructor(entriesHash: string, model: string) {
		const dir = getVectorIndexDir()
		const base = `${entriesHash}.${safeModelName(model)}`
		this.indexPath = path.join(dir, `${base}.hnsw`)
		this.manifestPath = path.join(dir, `${base}.manifest.json`)
		this.entriesHash = entriesHash
	}

	async build(
		entries: BmsAutosarKnowledgeEntry[],
		model: string,
		embeddingOptions: EmbeddingOptions,
	): Promise<void> {
		if (entries.length === 0) {
			this.manifest = {
				entriesHash: this.entriesHash ?? computeEntriesHash(entries),
				model,
				count: 0,
				dimensions: 0,
				createdAt: new Date().toISOString(),
			}
			await this.saveManifest()
			return
		}

		const vectors = await getEntryVectors(entries, model, embeddingOptions)
		if (vectors.length === 0) {
			throw new Error("No vectors available to build vector index")
		}

		const dimensions = vectors[0].vector.length
		const index = new HierarchicalNSW("cosine", dimensions)
		const maxElements = Math.max(entries.length, 16)
		index.initIndex(maxElements, 16, 200, 100)

		for (const { vector, entryIndex } of vectors) {
			index.addPoint(vector, entryIndex)
		}

		await ensureVectorIndexDir()
		index.writeIndexSync(this.indexPath)

		this.manifest = {
			entriesHash: this.entriesHash ?? computeEntriesHash(entries),
			model,
			count: vectors.length,
			dimensions,
			createdAt: new Date().toISOString(),
		}
		await this.saveManifest()
		this.index = index
	}

	async load(): Promise<boolean> {
		if (this.index) {
			return true
		}

		if (!(await fileExistsAtPath(this.indexPath)) || !(await fileExistsAtPath(this.manifestPath))) {
			return false
		}

		const rawManifest = await fs.readFile(this.manifestPath, "utf-8")
		const manifest = JSON.parse(rawManifest) as VectorIndexManifest
		if (this.entriesHash && manifest.entriesHash !== this.entriesHash) {
			return false
		}

		const index = new HierarchicalNSW("cosine", manifest.dimensions)
		index.readIndexSync(this.indexPath)
		this.manifest = manifest
		this.index = index
		return true
	}

	async search(queryVector: number[], topK: number): Promise<BmsAutosarVectorIndexSearchResult[]> {
		if (!this.index) {
			if (!(await this.load())) {
				return []
			}
		}

		if (!this.index || (this.manifest?.count ?? 0) === 0) {
			return []
		}

		const k = Math.min(topK, this.manifest?.count ?? 0)
		if (k <= 0) {
			return []
		}

		const result = this.index.searchKnn(queryVector, k)
		const output: BmsAutosarVectorIndexSearchResult[] = []
		for (let i = 0; i < result.neighbors.length; i++) {
			const distance = result.distances[i]
			const score = 1 - distance
			output.push({ entryIndex: result.neighbors[i], score })
		}
		return output
	}

	private async saveManifest(): Promise<void> {
		if (!this.manifest) {
			return
		}
		await ensureVectorIndexDir()
		await fs.writeFile(this.manifestPath, JSON.stringify(this.manifest), "utf-8")
	}
}

export async function getBmsAutosarVectorIndex(
	entries: BmsAutosarKnowledgeEntry[],
	model: string,
): Promise<BmsAutosarVectorIndex> {
	const entriesHash = computeEntriesHash(entries)
	return new BmsAutosarVectorIndex(entriesHash, model)
}

export { computeEntriesHash }

/**
 * Pre-computes and persists embeddings for entries that do not yet have a
 * vector in the cache. This is a best-effort background operation; failures
 * are silently ignored so that imports and searches can still proceed.
 */
export async function warmBmsAutosarVectorCache(
	entries: BmsAutosarKnowledgeEntry[],
	apiConfiguration: ApiConfiguration,
	model: string = DEFAULT_EMBEDDING_MODEL,
): Promise<void> {
	if (entries.length === 0) {
		return
	}

	const missing: Array<{ entry: BmsAutosarKnowledgeEntry; contentHash: string }> = []
	await Promise.all(
		entries.map(async (entry) => {
			const contentHash = hashContent(entry.content)
			const cached = await loadVectorCached(contentHash, model)
			if (!cached) {
				missing.push({ entry, contentHash })
			}
		}),
	)

	if (missing.length === 0) {
		return
	}

	try {
		const embeddings = await createEmbeddings(
			missing.map((m) => m.entry.content),
			{ apiConfiguration, model },
		)
		await Promise.all(
			embeddings.map(async (embedding, index) => {
				if (embedding) {
					await saveVectorCached(missing[index].contentHash, model, embedding.vector)
				}
			}),
		)
	} catch {
		// Best-effort warming.
	}
}
