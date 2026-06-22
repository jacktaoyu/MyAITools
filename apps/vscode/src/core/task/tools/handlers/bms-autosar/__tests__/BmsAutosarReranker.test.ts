import { strict as assert } from "node:assert"
import { describe, it } from "mocha"
import type { BmsAutosarKnowledgeEntry } from "../BmsAutosarKnowledgeTypes"
import { parseScoresFromResponse, rerankWithLlm } from "../BmsAutosarReranker"

function createEntry(topic: string, content: string): BmsAutosarKnowledgeEntry {
	return {
		topic,
		content,
		createdAt: new Date().toISOString(),
		updatedAt: new Date().toISOString(),
	}
}

describe("BmsAutosarReranker", () => {
	describe("parseScoresFromResponse", () => {
		it("parses a valid JSON scores array", () => {
			const response = 'Some text\n{"scores": [8, 3, 10]}\nMore text'
			const scores = parseScoresFromResponse(response, 3)
			assert.deepStrictEqual(scores, [8, 3, 10])
		})

		it("defaults to 5 when JSON is missing", () => {
			const scores = parseScoresFromResponse("no json here", 3)
			assert.deepStrictEqual(scores, [5, 5, 5])
		})

		it("defaults to 5 when score count mismatches", () => {
			const scores = parseScoresFromResponse('{"scores": [8, 3]}', 3)
			assert.deepStrictEqual(scores, [5, 5, 5])
		})

		it("clamps scores to the 0-10 range", () => {
			const scores = parseScoresFromResponse('{"scores": [-3, 12, 7.5]}', 3)
			assert.deepStrictEqual(scores, [0, 10, 7.5])
		})
	})

	describe("rerankWithLlm", () => {
		it("returns fallback scores when no API handler is available", async () => {
			const candidates = [
				{ entry: createEntry("A", "First"), stageOneScore: 0.9, index: 0 },
				{ entry: createEntry("B", "Second"), stageOneScore: 0.7, index: 1 },
			]

			const results = await rerankWithLlm({
				query: "test",
				candidates,
				apiConfiguration: {},
			})

			assert.equal(results.length, 2)
			assert.equal(results[0].entry.topic, "A")
			assert.equal(results[0].llmScore, 5)
			assert.ok(results[0].score >= 0 && results[0].score <= 1)
		})

		it("limits candidates to maxCandidates", async () => {
			const candidates = Array.from({ length: 20 }, (_, i) => ({
				entry: createEntry(`Entry ${i}`, `Content ${i}`),
				stageOneScore: 0.5,
				index: i,
			}))

			const results = await rerankWithLlm({
				query: "test",
				candidates,
				apiConfiguration: {},
				maxCandidates: 5,
			})

			assert.equal(results.length, 5)
		})
	})
})
