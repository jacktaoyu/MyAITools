import { buildApiHandler, type ApiHandler } from "@core/api"
import type { ApiConfiguration } from "@shared/api"
import { Logger } from "@/shared/services/Logger"
import type { BmsAutosarKnowledgeEntry } from "./BmsAutosarKnowledgeTypes"

export interface RerankCandidate {
	entry: BmsAutosarKnowledgeEntry
	/** Hybrid + graph score from the first retrieval stage (0-1). */
	stageOneScore: number
	/** Absolute index used to map results back to the caller. */
	index: number
}

export interface RerankResult {
	entry: BmsAutosarKnowledgeEntry
	/** Final combined score after reranking (0-1). */
	score: number
	index: number
	llmScore: number
}

export interface RerankerOptions {
	query: string
	candidates: RerankCandidate[]
	apiConfiguration: ApiConfiguration
	/** Maximum LLM candidates to score. Defaults to 15. */
	maxCandidates?: number
	/** Weight given to the LLM score when combining with the stage-one score. */
	llmWeight?: number
}

const DEFAULT_MAX_CANDIDATES = 15
const DEFAULT_LLM_WEIGHT = 0.4
const RERANK_SYSTEM_PROMPT = `You are an AUTOSAR Classic Platform and battery-management-system (BMS) domain expert.
Evaluate how relevant each candidate knowledge snippet is to the user's query.
Return ONLY a JSON object with a "scores" array containing one integer per candidate from 0 (irrelevant) to 10 (highly relevant). Do not include explanations.`

function truncate(text: string, maxChars: number): string {
	if (text.length <= maxChars) {
		return text
	}
	return `${text.slice(0, maxChars).trimEnd()}...`
}

function buildRerankPrompt(query: string, candidates: RerankCandidate[]): string {
	const lines = [
		`User query: ${query}`,
		"",
		"Candidates:",
		...candidates.map((candidate, i) => {
			const entry = candidate.entry
			const topic = entry.topic || "(untitled)"
			const content = truncate(entry.content || "", 600)
			const tags = entry.tags?.join(", ") || "none"
			return `[${i}] Topic: ${topic}\nTags: ${tags}\n${content}`
		}),
		"",
		'Respond with JSON only, for example: {"scores": [7, 2, 9]}',
	]
	return lines.join("\n")
}

async function callLlmForScores(
	api: ApiHandler,
	query: string,
	candidates: RerankCandidate[],
): Promise<number[]> {
	const prompt = buildRerankPrompt(query, candidates)
	const stream = api.createMessage(RERANK_SYSTEM_PROMPT, [{ role: "user", content: prompt }])

	let response = ""
	try {
		for await (const chunk of stream) {
			if (chunk.type === "text") {
				response += chunk.text
			}
		}
	} catch (error) {
		Logger.error("[BmsAutosarReranker] LLM reranking failed:", error)
		return candidates.map(() => 5)
	}

	return parseScoresFromResponse(response, candidates.length)
}

export function parseScoresFromResponse(response: string, expectedCount: number): number[] {
	const defaultScores = Array.from({ length: expectedCount }, () => 5)
	const jsonMatch = response.match(/\{[\s\S]*\}/)
	if (!jsonMatch) {
		return defaultScores
	}

	try {
		const parsed = JSON.parse(jsonMatch[0]) as { scores?: unknown }
		if (!Array.isArray(parsed.scores) || parsed.scores.length !== expectedCount) {
			return defaultScores
		}
		return parsed.scores.map((score) => {
			const numeric = typeof score === "number" ? score : Number(score)
			if (Number.isNaN(numeric)) {
				return 5
			}
			return Math.max(0, Math.min(10, numeric))
		})
	} catch {
		return defaultScores
	}
}

async function createRerankApiHandler(apiConfiguration: ApiConfiguration): Promise<ApiHandler | undefined> {
	try {
		return await buildApiHandler(apiConfiguration, "act")
	} catch (error) {
		Logger.error("[BmsAutosarReranker] Failed to build API handler:", error)
		return undefined
	}
}

/**
 * Reranks retrieval candidates using the configured LLM as a judge.
 *
 * The LLM scores each candidate's relevance on a 0-10 scale. The final score
 * is a weighted combination of the first-stage hybrid+graph score and the
 * normalized LLM score. If the LLM call fails or no API handler is available,
 * candidates fall back to their stage-one scores unchanged.
 */
export async function rerankWithLlm(options: RerankerOptions): Promise<RerankResult[]> {
	const { query, candidates, apiConfiguration, maxCandidates = DEFAULT_MAX_CANDIDATES, llmWeight = DEFAULT_LLM_WEIGHT } = options
	if (candidates.length === 0) {
		return []
	}

	const api = await createRerankApiHandler(apiConfiguration)
	const scoredCandidates = candidates.slice(0, Math.max(1, maxCandidates))

	let llmScores: number[]
	if (api) {
		llmScores = await callLlmForScores(api, query, scoredCandidates)
	} else {
		llmScores = scoredCandidates.map(() => 5)
	}

	const clampedWeight = Math.max(0, Math.min(1, llmWeight))
	const stageOneWeight = 1 - clampedWeight

	return scoredCandidates.map((candidate, i) => {
		const normalizedLlmScore = llmScores[i] / 10
		const score = stageOneWeight * candidate.stageOneScore + clampedWeight * normalizedLlmScore
		return {
			entry: candidate.entry,
			score,
			index: candidate.index,
			llmScore: llmScores[i],
		}
	})
}
