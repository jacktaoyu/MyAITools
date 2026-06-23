import fs from "node:fs/promises"
import path from "node:path"
import { fileExistsAtPath } from "@utils/fs"
import { getClineHomePath } from "@/core/storage/disk"
import { telemetryService } from "@/services/telemetry"
import { createEmbedding, type EmbeddingResult, hashContent } from "./BmsAutosarEmbeddingService"
import type { BmsAutosarKnowledgeFile, BmsAutosarKnowledgeSource } from "./BmsAutosarKnowledgeTypes"
import type { ApiConfiguration } from "@shared/api"
import type { BmsAutosarTemplates } from "./BmsAutosarTemplateRenderer"
import type { ArxmlEdge, ArxmlGraph, ArxmlNode } from "./BmsAutosarKnowledgeGraph"

interface TemplatesCacheEntry {
	mtimeMs: number
	templates: BmsAutosarTemplates
}

interface KnowledgeCacheEntry {
	mtimeMs: number
	source: BmsAutosarKnowledgeSource
}

export interface LexicalIndex {
	vocabulary: string[]
	idf: number[]
	termFrequencies: number[][]
	docLengths: number[]
	avgdl: number
	numDocs: number
}

interface LexicalCacheEntry {
	index: LexicalIndex
	sourcesHash: string
}

export interface ArxmlGraphCacheEntry {
	mtimeMs: number
	nodes: ArxmlNode[]
	edges: ArxmlEdge[]
}

const DEFAULT_MEMORY_LIMIT = 128
const DEFAULT_TTL_MS = 1000 * 60 * 30 // 30 minutes

class LRUCache<K, V> {
	private cache = new Map<K, { value: V; timestamp: number }>()

	constructor(
		private maxSize: number,
		private ttlMs: number,
	) {}

	get(key: K): V | undefined {
		const entry = this.cache.get(key)
		if (!entry) {
			return undefined
		}
		if (Date.now() - entry.timestamp > this.ttlMs) {
			this.cache.delete(key)
			return undefined
		}
		entry.timestamp = Date.now()
		return entry.value
	}

	set(key: K, value: V): void {
		if (this.cache.size >= this.maxSize && !this.cache.has(key)) {
			const oldest = this.cache.keys().next().value
			if (oldest !== undefined) {
				this.cache.delete(oldest)
			}
		}
		this.cache.set(key, { value, timestamp: Date.now() })
	}

	delete(key: K): void {
		this.cache.delete(key)
	}

	clear(): void {
		this.cache.clear()
	}
}

const templatesCache = new LRUCache<string, TemplatesCacheEntry>(DEFAULT_MEMORY_LIMIT, DEFAULT_TTL_MS)
const knowledgeCache = new LRUCache<string, KnowledgeCacheEntry>(DEFAULT_MEMORY_LIMIT, DEFAULT_TTL_MS)
const queryEmbeddingCache = new LRUCache<string, EmbeddingResult>(DEFAULT_MEMORY_LIMIT, DEFAULT_TTL_MS)
const lexicalCache = new LRUCache<string, LexicalCacheEntry>(DEFAULT_MEMORY_LIMIT, DEFAULT_TTL_MS)
const arxmlGraphCache = new LRUCache<string, ArxmlGraphCacheEntry>(DEFAULT_MEMORY_LIMIT, DEFAULT_TTL_MS)

function getDiskCacheDir(): string {
	return path.join(getClineHomePath(), "bms-autosar", "cache")
}

async function ensureDiskCacheDir(): Promise<string> {
	const dir = getDiskCacheDir()
	await fs.mkdir(dir, { recursive: true })
	return dir
}

function queryEmbeddingCacheKey(model: string, contentHash: string): string {
	return `${hashContent(`${model}:${contentHash}`)}.embedding.json`
}

async function loadQueryEmbeddingFromDisk(model: string, contentHash: string): Promise<EmbeddingResult | undefined> {
	try {
		const dir = await ensureDiskCacheDir()
		const filePath = path.join(dir, queryEmbeddingCacheKey(model, contentHash))
		if (!(await fileExistsAtPath(filePath))) {
			return undefined
		}
		const raw = await fs.readFile(filePath, "utf-8")
		const parsed = JSON.parse(raw) as EmbeddingResult
		if (!Array.isArray(parsed.vector) || parsed.model !== model || parsed.contentHash !== contentHash) {
			return undefined
		}
		return parsed
	} catch {
		return undefined
	}
}

async function saveQueryEmbeddingToDisk(embedding: EmbeddingResult): Promise<void> {
	try {
		const dir = await ensureDiskCacheDir()
		const filePath = path.join(dir, queryEmbeddingCacheKey(embedding.model, embedding.contentHash))
		await fs.writeFile(filePath, JSON.stringify(embedding), "utf-8")
	} catch {
		// Disk cache is best-effort.
	}
}

function computeSourcesHash(sources: BmsAutosarKnowledgeSource[]): string {
	const parts = sources
		.map((source) => {
			const entryHashes = source.entries.map((entry) => hashContent(entry.content)).join(",")
			return `${source.path}:${entryHashes}`
		})
		.sort()
	return hashContent(parts.join("\n"))
}

async function loadLexicalIndexFromDisk(sourcesHash: string): Promise<LexicalIndex | undefined> {
	try {
		const dir = await ensureDiskCacheDir()
		const filePath = path.join(dir, `${sourcesHash}.lexical.json`)
		if (!(await fileExistsAtPath(filePath))) {
			return undefined
		}
		const raw = await fs.readFile(filePath, "utf-8")
		const parsed = JSON.parse(raw) as LexicalIndex
		if (
			!Array.isArray(parsed.vocabulary) ||
			!Array.isArray(parsed.idf) ||
			!Array.isArray(parsed.termFrequencies) ||
			!Array.isArray(parsed.docLengths) ||
			typeof parsed.avgdl !== "number" ||
			typeof parsed.numDocs !== "number"
		) {
			return undefined
		}
		return parsed
	} catch {
		return undefined
	}
}

async function saveLexicalIndexToDisk(sourcesHash: string, index: LexicalIndex): Promise<void> {
	try {
		const dir = await ensureDiskCacheDir()
		const filePath = path.join(dir, `${sourcesHash}.lexical.json`)
		await fs.writeFile(filePath, JSON.stringify(index), "utf-8")
	} catch {
		// Disk cache is best-effort.
	}
}

/**
 * Loads templates.json with in-memory mtime-based caching.
 */
export async function loadTemplatesCached(templatesPath: string): Promise<BmsAutosarTemplates | undefined> {
	const stat = await fs.stat(templatesPath).catch(() => undefined)
	if (!stat) {
		templatesCache.delete(templatesPath)
		return undefined
	}

	const cached = templatesCache.get(templatesPath)
	if (cached && cached.mtimeMs === stat.mtimeMs) {
		return cached.templates
	}

	const content = await fs.readFile(templatesPath, "utf-8")
	const templates = JSON.parse(content) as BmsAutosarTemplates
	templatesCache.set(templatesPath, { mtimeMs: stat.mtimeMs, templates })
	return templates
}

/**
 * Loads a single knowledge source with in-memory mtime-based caching.
 */
export async function loadKnowledgeSourceCached(filePath: string): Promise<BmsAutosarKnowledgeSource | undefined> {
	const stat = await fs.stat(filePath).catch(() => undefined)
	if (!stat) {
		knowledgeCache.delete(filePath)
		return undefined
	}

	const cached = knowledgeCache.get(filePath)
	if (cached && cached.mtimeMs === stat.mtimeMs) {
		return cached.source
	}

	const content = await fs.readFile(filePath, "utf-8")
	if (!content.trim()) {
		knowledgeCache.delete(filePath)
		return undefined
	}

	const parsed = JSON.parse(content) as BmsAutosarKnowledgeFile
	const source: BmsAutosarKnowledgeSource = {
		path: filePath,
		entries: Array.isArray(parsed.entries) ? parsed.entries : [],
	}
	knowledgeCache.set(filePath, { mtimeMs: stat.mtimeMs, source })
	return source
}

/**
 * Loads merged workspace + global knowledge sources with in-memory caching.
 */
export async function loadBmsAutosarKnowledgeBaseWithSourcesCached(cwd: string): Promise<BmsAutosarKnowledgeSource[]> {
	const workspacePath = path.join(cwd, ".cline", "bms-autosar", "knowledge.json")
	const globalPath = path.join(getClineHomePath(), "bms-autosar", "knowledge.json")

	const results = await Promise.allSettled([loadKnowledgeSourceCached(workspacePath), loadKnowledgeSourceCached(globalPath)])
	const sources: BmsAutosarKnowledgeSource[] = []
	for (const result of results) {
		if (result.status === "fulfilled" && result.value) {
			sources.push(result.value)
		}
	}
	return sources
}

/**
 * Returns a memoized query embedding, backed by an in-memory LRU cache and a
 * persistent disk cache keyed by model and content hash.
 */
export async function getCachedQueryEmbedding(
	query: string,
	model: string,
	apiConfiguration: ApiConfiguration,
): Promise<EmbeddingResult | undefined> {
	const trimmed = query.trim()
	if (!trimmed) {
		return undefined
	}
	const contentHash = hashContent(trimmed)
	const key = `${model}:${contentHash}`

	const memoryCached = queryEmbeddingCache.get(key)
	if (memoryCached) {
		telemetryService.captureBmsAutosarEmbeddingCacheHit()
		return memoryCached
	}

	const diskCached = await loadQueryEmbeddingFromDisk(model, contentHash)
	if (diskCached) {
		queryEmbeddingCache.set(key, diskCached)
		telemetryService.captureBmsAutosarEmbeddingCacheHit()
		return diskCached
	}

	const embedding = await createEmbedding(trimmed, { apiConfiguration, model })
	if (embedding) {
		queryEmbeddingCache.set(key, embedding)
		await saveQueryEmbeddingToDisk(embedding)
		telemetryService.captureBmsAutosarEmbeddingCacheMiss()
	}
	return embedding
}

/**
 * Retrieves a cached lexical (BM25) index for the given knowledge sources. The
 * cache is invalidated automatically when the combined content hash of the
 * sources changes.
 */
export async function getCachedLexicalIndex(
	sources: BmsAutosarKnowledgeSource[],
	buildIndex: () => LexicalIndex | Promise<LexicalIndex>,
): Promise<LexicalIndex> {
	const sourcesHash = computeSourcesHash(sources)
	const memoryCached = lexicalCache.get(sourcesHash)
	if (memoryCached && memoryCached.sourcesHash === sourcesHash) {
		return memoryCached.index
	}

	const diskCached = await loadLexicalIndexFromDisk(sourcesHash)
	if (diskCached) {
		lexicalCache.set(sourcesHash, { index: diskCached, sourcesHash })
		return diskCached
	}

	const index = await buildIndex()
	lexicalCache.set(sourcesHash, { index, sourcesHash })
	await saveLexicalIndexToDisk(sourcesHash, index)
	return index
}

/**
 * Finds and loads templates.json from a list of candidate paths using the cache.
 */
export async function findAndLoadTemplatesCached(
	candidatePaths: string[],
	fallback: BmsAutosarTemplates,
): Promise<BmsAutosarTemplates> {
	for (const templatesPath of candidatePaths) {
		if (await fileExistsAtPath(templatesPath)) {
			try {
				const templates = await loadTemplatesCached(templatesPath)
				if (templates) {
					return templates
				}
			} catch {
				// Continue to next candidate
			}
		}
	}
	return fallback
}

/**
 * Invalidates cached entries. If a file path is provided, only that path is
 * cleared; otherwise the entire in-memory cache is reset.
 */
function arxmlGraphCacheKey(filePath: string): string {
	return `${hashContent(filePath)}.arxml-graph.json`
}

export async function loadArxmlGraphCached(filePath: string): Promise<ArxmlGraph | undefined> {
	const stat = await fs.stat(filePath).catch(() => undefined)
	if (!stat) {
		arxmlGraphCache.delete(filePath)
		return undefined
	}

	const memoryCached = arxmlGraphCache.get(filePath)
	if (memoryCached && memoryCached.mtimeMs === stat.mtimeMs) {
		return { nodes: new Map(memoryCached.nodes.map((n) => [n.id, n])), edges: memoryCached.edges }
	}

	try {
		const dir = path.join(await ensureDiskCacheDir(), "arxml-graph")
		await fs.mkdir(dir, { recursive: true })
		const cachePath = path.join(dir, arxmlGraphCacheKey(filePath))
		const raw = await fs.readFile(cachePath, "utf-8")
		const parsed = JSON.parse(raw) as ArxmlGraphCacheEntry
		if (parsed.mtimeMs === stat.mtimeMs && Array.isArray(parsed.nodes) && Array.isArray(parsed.edges)) {
			arxmlGraphCache.set(filePath, parsed)
			return { nodes: new Map(parsed.nodes.map((n) => [n.id, n])), edges: parsed.edges }
		}
	} catch {
		// Disk cache miss or corrupt; re-parse below.
	}

	return undefined
}

export async function saveArxmlGraphCached(filePath: string, mtimeMs: number, graph: ArxmlGraph): Promise<void> {
	try {
		const entry: ArxmlGraphCacheEntry = {
			mtimeMs,
			nodes: Array.from(graph.nodes.values()),
			edges: graph.edges,
		}
		arxmlGraphCache.set(filePath, entry)
		const dir = path.join(await ensureDiskCacheDir(), "arxml-graph")
		await fs.mkdir(dir, { recursive: true })
		const cachePath = path.join(dir, arxmlGraphCacheKey(filePath))
		await fs.writeFile(cachePath, JSON.stringify(entry), "utf-8")
	} catch {
		// Disk cache is best-effort.
	}
}

export function invalidateBmsAutosarKnowledgeCache(filePath?: string): void {
	if (filePath) {
		templatesCache.delete(filePath)
		knowledgeCache.delete(filePath)
		arxmlGraphCache.delete(filePath)
	} else {
		templatesCache.clear()
		knowledgeCache.clear()
		queryEmbeddingCache.clear()
		lexicalCache.clear()
		arxmlGraphCache.clear()
	}
}
