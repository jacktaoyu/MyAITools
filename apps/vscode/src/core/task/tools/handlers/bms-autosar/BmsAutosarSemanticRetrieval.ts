import type { ApiConfiguration } from "@shared/api"
import fs from "fs/promises"
import * as path from "path"
import { telemetryService } from "@/services/telemetry"
import { createEmbeddings, DEFAULT_EMBEDDING_MODEL, hashContent } from "./BmsAutosarEmbeddingService"
import { getCachedLexicalIndex, getCachedQueryEmbedding, loadVectorCached, saveVectorCached } from "./BmsAutosarKnowledgeCache"
import { getBmsAutosarVectorIndex } from "./BmsAutosarVectorIndex"
import { buildArxmlKnowledgeGraph, rankByGraphProximity } from "./BmsAutosarKnowledgeGraph"
import type { BmsAutosarKnowledgeEntry, BmsAutosarKnowledgeSource } from "./BmsAutosarKnowledgeTypes"
import { expandAutosarQuery, type BmsAutosarKnowledgeIntent } from "./BmsAutosarQueryExpander"
import { rerankWithLlm } from "./BmsAutosarReranker"
import { BM25_B, BM25_K1, STOP_WORDS } from "./BmsAutosarRetrievalConstants"
import { type Bm25Index, computeBm25IndexInWorker, computeBm25ScoresInWorker } from "./BmsAutosarRetrievalWorker"

const DEFAULT_HYBRID_WEIGHT = 0.7
const LEXICAL_WORKER_THRESHOLD = 100

export interface SemanticRetrievalOptions {
	sources: BmsAutosarKnowledgeSource[]
	query: string
	apiConfiguration: ApiConfiguration
	topK?: number
	embeddingModel?: string
	scoreThreshold?: number
	/**
	 * Weight given to the embedding score when fusing with lexical (BM25) scores.
	 * Must be between 0 and 1. Defaults to 0.7.
	 */
	hybridWeight?: number
	/** Optional tag pre-filter: entries must match at least one provided tag. */
	tags?: string[]
	/** Optional source-file pre-filter: entries must match at least one provided source file. */
	sourceFiles?: string[]
	/** When true, run an LLM-as-reranker second stage over the top candidates. */
	useReranker?: boolean
	/**
	 * When true (default), use an approximate vector index (HNSW) instead of a
	 * linear scan for large knowledge bases. Falls back to linear scan if the
	 * index cannot be built or loaded.
	 */
	useVectorIndex?: boolean
	/** Optional inferred query intent used to tune retrieval strategy. */
	intent?: BmsAutosarKnowledgeIntent
}

export interface RetrievalResult {
	entry: BmsAutosarKnowledgeEntry
	score: number
	sourcePath: string
}

function tokenize(text: string): string[] {
	return text
		.toLowerCase()
		.split(/[^a-z0-9_]+/)
		.filter((token) => token.length > 1 && !STOP_WORDS.has(token))
}

function computeBm25Index(texts: string[]): Bm25Index {
	const docs = texts.map(tokenize)
	const vocabulary = Array.from(new Set(docs.flat()))
	const numDocs = docs.length
	const docLengths = docs.map((tokens) => tokens.length)
	const totalTerms = docLengths.reduce((sum, len) => sum + len, 0)
	const avgdl = numDocs === 0 ? 0 : totalTerms / numDocs

	const idf = vocabulary.map((term) => {
		const docsWithTerm = docs.filter((tokens) => tokens.includes(term)).length
		return Math.log((numDocs - docsWithTerm + 0.5) / (docsWithTerm + 0.5) + 1)
	})

	const termFrequencies = docs.map((tokens) => {
		const freq = new Map<string, number>()
		tokens.forEach((token) => {
			freq.set(token, (freq.get(token) ?? 0) + 1)
		})
		return vocabulary.map((term) => freq.get(term) ?? 0)
	})

	return { vocabulary, idf, termFrequencies, docLengths, avgdl, numDocs }
}

function computeBm25Scores(index: Bm25Index, query: string): number[] {
	const queryTokens = tokenize(query)
	const tokenCounts = new Map<string, number>()
	queryTokens.forEach((token) => {
		tokenCounts.set(token, (tokenCounts.get(token) ?? 0) + 1)
	})

	const scores = new Array(index.numDocs).fill(0)
	for (const [token, count] of tokenCounts.entries()) {
		const termIndex = index.vocabulary.indexOf(token)
		if (termIndex === -1) {
			continue
		}
		const idf = index.idf[termIndex]
		for (let docIndex = 0; docIndex < index.numDocs; docIndex++) {
			const tf = index.termFrequencies[docIndex][termIndex]
			if (tf === 0) {
				continue
			}
			const docLen = index.docLengths[docIndex]
			const denom = tf + BM25_K1 * (1 - BM25_B + BM25_B * (docLen / index.avgdl))
			scores[docIndex] += idf * ((tf * (BM25_K1 + 1)) / denom) * count
		}
	}
	return scores
}

function cosineSimilarity(a: number[], b: number[]): number {
	let dot = 0
	let normA = 0
	let normB = 0
	for (let i = 0; i < a.length; i++) {
		dot += a[i] * b[i]
		normA += a[i] * a[i]
		normB += b[i] * b[i]
	}
	if (normA === 0 || normB === 0) {
		return 0
	}
	return dot / (Math.sqrt(normA) * Math.sqrt(normB))
}

function entryText(entry: BmsAutosarKnowledgeEntry): string {
	return `${entry.topic}\n${entry.content}`
}

function normalizeScores(scores: number[]): number[] {
	const min = Math.min(...scores)
	const max = Math.max(...scores)
	if (max === min) {
		return scores.map(() => 0)
	}
	return scores.map((score) => (score - min) / (max - min))
}

function normalizeFilterValues(values: string[] | undefined): Set<string> {
	return new Set((values || []).map((value) => value.trim().toLowerCase()).filter(Boolean))
}

function entryMatchesFilters(entry: BmsAutosarKnowledgeEntry, tags: Set<string>, sourceFiles: Set<string>): boolean {
	if (tags.size === 0 && sourceFiles.size === 0) {
		return true
	}

	const matchesTag = tags.size === 0 || (entry.tags || []).some((tag) => tags.has(tag.trim().toLowerCase()))
	if (!matchesTag) {
		return false
	}

	const matchesSourceFile =
		sourceFiles.size === 0 || (entry.sourceFiles || []).some((file) => sourceFiles.has(file.trim().toLowerCase()))
	return matchesSourceFile
}

function filterSourcesByMetadata(
	sources: BmsAutosarKnowledgeSource[],
	tags?: string[],
	sourceFiles?: string[],
): BmsAutosarKnowledgeSource[] {
	const normalizedTags = normalizeFilterValues(tags)
	const normalizedSourceFiles = normalizeFilterValues(sourceFiles)

	if (normalizedTags.size === 0 && normalizedSourceFiles.size === 0) {
		return sources
	}

	return sources
		.map((source) => ({
			...source,
			entries: source.entries.filter((entry) => entryMatchesFilters(entry, normalizedTags, normalizedSourceFiles)),
		}))
		.filter((source) => source.entries.length > 0)
}

function clampHybridWeight(weight: number | undefined): number {
	if (weight === undefined) {
		return DEFAULT_HYBRID_WEIGHT
	}
	if (Number.isNaN(weight)) {
		return DEFAULT_HYBRID_WEIGHT
	}
	return Math.max(0, Math.min(1, weight))
}

function getIntentHybridWeight(intent: BmsAutosarKnowledgeIntent | undefined, explicitWeight: number | undefined): number | undefined {
	if (explicitWeight !== undefined) {
		return explicitWeight
	}
	switch (intent) {
		case "component_lookup":
			return 0.85
		case "interface_search":
			return 0.75
		case "safety_guidance":
			return 0.65
		default:
			return undefined
	}
}

const VECTOR_INDEX_MIN_ENTRIES = 64
const VECTOR_INDEX_CANDIDATE_MULTIPLIER = 10
const VECTOR_INDEX_MIN_CANDIDATES = 100

async function computeEmbeddingScores(
	sources: BmsAutosarKnowledgeSource[],
	query: string,
	apiConfiguration: ApiConfiguration,
	model: string,
	candidateLimit: number,
	useVectorIndex = true,
): Promise<{ scores: Map<BmsAutosarKnowledgeEntry, number>; anyNew: boolean } | undefined> {
	const entries = sources.flatMap((source) => source.entries)
	if (entries.length === 0) {
		return undefined
	}

	const queryEmbedding = await getCachedQueryEmbedding(query, model, apiConfiguration)
	if (!queryEmbedding) {
		return undefined
	}

	// For large knowledge bases, use an approximate vector index to avoid the
	 // O(N) linear cosine scan. The index is keyed by the content hash of the
	 // entry set, so it is automatically invalidated when entries change.
	if (useVectorIndex && entries.length >= VECTOR_INDEX_MIN_ENTRIES) {
		try {
			const vectorIndex = await getBmsAutosarVectorIndex(entries, model)
			const loaded = await vectorIndex.load()
			if (!loaded) {
				await vectorIndex.build(entries, model, { apiConfiguration, model })
			}
			const k = Math.min(candidateLimit, entries.length)
			const results = await vectorIndex.search(queryEmbedding.vector, k)
			const scores = new Map<BmsAutosarKnowledgeEntry, number>()
			for (const { entryIndex, score } of results) {
				scores.set(entries[entryIndex], score)
			}
			return { scores, anyNew: !loaded }
		} catch {
			// Fall back to the linear scan below if the index fails to build or search.
		}
	}

	const textsToEmbed: string[] = []
	const hashesToEmbed: string[] = []

	// Resolve which entries need fresh embeddings by querying the vector cache.
	const entryVectors = new Map<BmsAutosarKnowledgeEntry, number[]>()
	await Promise.all(
		entries.map(async (entry) => {
			const currentHash = hashContent(entry.content)
			const cachedVector = await loadVectorCached(currentHash, model)
			if (cachedVector) {
				entryVectors.set(entry, cachedVector)
			} else {
				textsToEmbed.push(entryText(entry))
				hashesToEmbed.push(currentHash)
			}
		}),
	)

	let anyNew = false
	if (textsToEmbed.length > 0) {
		const embeddings = await createEmbeddings(textsToEmbed, { apiConfiguration, model })
		embeddings.forEach((embedding, index) => {
			if (embedding) {
				entryVectors.set(entries[index], embedding.vector)
				saveVectorCached(hashesToEmbed[index], model, embedding.vector).catch(() => {
					// Vector cache persistence is best-effort.
				})
				anyNew = true
			}
		})
	}

	const queryVector = queryEmbedding.vector
	const scores = new Map<BmsAutosarKnowledgeEntry, number>()
	let scoredCount = 0

	for (const entry of entries) {
		const vector = entryVectors.get(entry)
		if (!vector) {
			continue
		}
		scores.set(entry, cosineSimilarity(queryVector, vector))
		scoredCount++
	}

	// If no entry could be embedded, signal a full fallback to lexical retrieval.
	if (scoredCount === 0) {
		return undefined
	}

	return { scores, anyNew }
}

async function computeLexicalScores(
	sources: BmsAutosarKnowledgeSource[],
	entries: BmsAutosarKnowledgeEntry[],
	query: string,
): Promise<Map<BmsAutosarKnowledgeEntry, number>> {
	const texts = entries.map(entryText)

	const index = await getCachedLexicalIndex(sources, () => {
		if (entries.length > LEXICAL_WORKER_THRESHOLD) {
			return computeBm25IndexInWorker(texts)
		}
		return computeBm25Index(texts)
	})

	let scoresArray: number[]
	if (entries.length > LEXICAL_WORKER_THRESHOLD) {
		scoresArray = await computeBm25ScoresInWorker(texts, query)
	} else {
		scoresArray = computeBm25Scores(index, query)
	}

	const scores = new Map<BmsAutosarKnowledgeEntry, number>()
	entries.forEach((entry, index) => {
		scores.set(entry, scoresArray[index])
	})
	return scores
}

/**
 * Retrieves the most relevant knowledge entries for a generation query.
 *
 * When an OpenAI-compatible API key or a local Ollama embedding endpoint is
 * available, embeddings are used. Newly computed embeddings are persisted back
 * to their source knowledge files so they can be reused on subsequent
 * retrievals. Lexical relevance is always computed with BM25 and fused with the
 * embedding score using the configured hybrid weight.
 */
export async function retrieveRelevantKnowledgeResults(options: SemanticRetrievalOptions): Promise<RetrievalResult[]> {
	const {
		sources,
		query,
		apiConfiguration,
		topK = 5,
		embeddingModel = DEFAULT_EMBEDDING_MODEL,
		tags,
		sourceFiles,
		useReranker,
		useVectorIndex,
		intent,
	} = options

	const filteredSources = filterSourcesByMetadata(sources, tags, sourceFiles)
	const entries = filteredSources.flatMap((source) => source.entries)

	if (entries.length === 0) {
		return []
	}

	const entrySourcePath = new Map<BmsAutosarKnowledgeEntry, string>()
	for (const source of filteredSources) {
		for (const entry of source.entries) {
			entrySourcePath.set(entry, source.path)
		}
	}

	// Expand the query with AUTOSAR/BMS synonyms so embedding and BM25 can
	// bridge vocabulary gaps such as CSC/Cell Supervision Circuit/AFE.
	const { expanded: expandedQuery } = expandAutosarQuery(query)

	let embeddingScores: Map<BmsAutosarKnowledgeEntry, number> | undefined
	let _embeddingAnyNew = false

	try {
		const candidateLimit = Math.max(topK * VECTOR_INDEX_CANDIDATE_MULTIPLIER, VECTOR_INDEX_MIN_CANDIDATES)
		const embeddingResult = await computeEmbeddingScores(
			filteredSources,
			expandedQuery,
			apiConfiguration,
			embeddingModel,
			candidateLimit,
			useVectorIndex,
		)
		if (embeddingResult) {
			embeddingScores = embeddingResult.scores
			_embeddingAnyNew = embeddingResult.anyNew
		}
	} catch {
		embeddingScores = undefined
	}

	const lexicalScores = await computeLexicalScores(filteredSources, entries, expandedQuery)

	if (!embeddingScores) {
		telemetryService.captureBmsAutosarRetrievalTfidfFallback()
	}

	const embeddingWeight = clampHybridWeight(getIntentHybridWeight(intent, options.hybridWeight))
	const lexicalWeight = 1 - embeddingWeight

	const rawLexicalScores = entries.map((entry) => lexicalScores.get(entry) ?? 0)
	// Entries without a usable embedding should fall back to their lexical score
	// rather than contributing a zero to the hybrid ranking.
	const rawEmbeddingScores = entries.map((entry, index) => embeddingScores?.get(entry) ?? rawLexicalScores[index])

	const normalizedEmbedding = normalizeScores(rawEmbeddingScores)
	const normalizedLexical = normalizeScores(rawLexicalScores)

	// Build ARXML knowledge graphs from referenced source files and boost entries
	// that are topologically close to query-relevant AUTOSAR elements.
	const graphBoosts = await computeGraphBoosts(filteredSources, entries, expandedQuery)

	const stageOneRanked = entries
		.map((entry, index) => {
			const embeddingScore = normalizedEmbedding[index]
			const lexicalScore = normalizedLexical[index]
			const hybridScore = embeddingWeight * embeddingScore + lexicalWeight * lexicalScore
			const boost = graphBoosts.get(index) ?? 0
			return {
				entry,
				score: hybridScore + boost * 0.15,
				sourcePath: entrySourcePath.get(entry) ?? "",
				index,
			}
		})
		.sort((a, b) => b.score - a.score)

	// Optional second-stage LLM reranking. We rerank the top candidates (more
	// than topK to give the LLM room to reorder) and then apply threshold/topK.
	const rerankCandidateCount = Math.max(topK * 3, 15)
	const rerankCandidates = stageOneRanked.slice(0, rerankCandidateCount)

	let reranked = rerankCandidates
	if (useReranker && rerankCandidates.length > 1) {
		try {
			const llmResults = await rerankWithLlm({
				query: expandedQuery,
				candidates: rerankCandidates.map((candidate) => ({
					entry: candidate.entry,
					stageOneScore: candidate.score,
					index: candidate.index,
				})),
				apiConfiguration,
			})
			reranked = llmResults
				.map((result) => ({
					entry: result.entry,
					score: result.score,
					sourcePath: entrySourcePath.get(result.entry) ?? "",
					index: result.index,
				}))
				.sort((a, b) => b.score - a.score)
		} catch {
			// Fall back to stage-one ranking if the LLM reranker fails.
		}
	}

	const threshold = options.scoreThreshold ?? 0
	const filtered = reranked.filter((item) => item.score >= threshold)

	return filtered.slice(0, topK)
}

async function computeGraphBoosts(
	sources: BmsAutosarKnowledgeSource[],
	entries: BmsAutosarKnowledgeEntry[],
	query: string,
): Promise<Map<number, number>> {
	const boosts = new Map<number, number>()
	if (entries.length === 0) {
		return boosts
	}

	const arxmlFiles = new Set<string>()
	for (const source of sources) {
		for (const entry of source.entries) {
			for (const sourceFile of entry.sourceFiles || []) {
				if (sourceFile.toLowerCase().endsWith(".arxml")) {
					// sourceFiles are relative to the import folder; try to resolve them
					// relative to the knowledge file directory.
					const candidate = path.isAbsolute(sourceFile) ? sourceFile : path.join(path.dirname(source.path), sourceFile)
					arxmlFiles.add(candidate)
				}
			}
		}
	}

	if (arxmlFiles.size === 0) {
		return boosts
	}

	try {
		const contents: string[] = []
		for (const file of arxmlFiles) {
			try {
				contents.push(await fs.readFile(file, "utf-8"))
			} catch {
				// Ignore missing source ARXML files; the user may have moved them.
			}
		}
		if (contents.length === 0) {
			return boosts
		}

		const combinedGraph = buildArxmlKnowledgeGraph(contents.join("\n"))
		return rankByGraphProximity(combinedGraph, entries, query)
	} catch {
		return boosts
	}
}

/**
 * Backwards-compatible wrapper that returns only the knowledge entries.
 */
export async function retrieveRelevantKnowledgeEntries(options: SemanticRetrievalOptions): Promise<BmsAutosarKnowledgeEntry[]> {
	const results = await retrieveRelevantKnowledgeResults(options)
	return results.map((result) => result.entry)
}
