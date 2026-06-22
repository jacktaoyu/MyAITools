import { strict as assert } from "node:assert"
import { describe, it } from "mocha"
import type { BmsAutosarKnowledgeEntry, BmsAutosarKnowledgeSource } from "../BmsAutosarKnowledgeTypes"
import { retrieveRelevantKnowledgeEntries, retrieveRelevantKnowledgeResults } from "../BmsAutosarSemanticRetrieval"

function createEntry(topic: string, content: string): BmsAutosarKnowledgeEntry {
	return {
		topic,
		content,
		createdAt: new Date().toISOString(),
		updatedAt: new Date().toISOString(),
	}
}

function createSource(entries: BmsAutosarKnowledgeEntry[], sourcePath = "/tmp/knowledge.json"): BmsAutosarKnowledgeSource {
	return { path: sourcePath, entries }
}

describe("BmsAutosarSemanticRetrieval", () => {
	describe("BM25 lexical fallback", () => {
		it("returns an empty array when no sources are provided", async () => {
			const result = await retrieveRelevantKnowledgeEntries({
				sources: [],
				query: "Generate swc BmsCellMonitor",
				apiConfiguration: {},
				topK: 3,
			})
			assert.deepStrictEqual(result, [])
		})

		it("returns topK entries ranked by BM25 lexical relevance", async () => {
			const entries = [
				createEntry("Cell Monitoring", "SWC for measuring battery cell voltages and temperatures."),
				createEntry("State of Charge", "Algorithm for estimating lithium-ion state of charge."),
				createEntry("Contactors", "High voltage contactor control and weld detection logic."),
				createEntry("Thermal Runaway", "Detecting thermal runaway conditions in battery packs."),
			]

			const result = await retrieveRelevantKnowledgeEntries({
				sources: [createSource(entries)],
				query: "cell voltage measurement swc",
				apiConfiguration: {},
				topK: 2,
			})

			assert.equal(result.length, 2)
			assert.equal(result[0].topic, "Cell Monitoring")
		})

		it("prefers entries matching component name and type", async () => {
			const entries = [
				createEntry("Generic AUTOSAR", "General AUTOSAR Classic Platform guidance."),
				createEntry("BmsStateEstimator", "State estimator SWC for battery management."),
				createEntry("Legacy Project", "Notes from an unrelated project."),
			]

			const result = await retrieveRelevantKnowledgeEntries({
				sources: [createSource(entries)],
				query: "Generate swc BmsStateEstimator",
				apiConfiguration: {},
				topK: 1,
			})

			assert.equal(result.length, 1)
			assert.equal(result[0].topic, "BmsStateEstimator")
		})

		it("returns all entries when topK exceeds entry count", async () => {
			const entries = [createEntry("A", "First"), createEntry("B", "Second")]
			const result = await retrieveRelevantKnowledgeEntries({
				sources: [createSource(entries)],
				query: "anything",
				apiConfiguration: {},
				topK: 10,
			})
			assert.equal(result.length, 2)
		})

		it("returns an empty array when score threshold is not met", async () => {
			const entries = [
				createEntry("Legacy Project", "Notes from an unrelated project."),
				createEntry("Another Legacy", "More unrelated content."),
			]
			const result = await retrieveRelevantKnowledgeEntries({
				sources: [createSource(entries)],
				query: "Generate swc BmsStateEstimator",
				apiConfiguration: {},
				topK: 5,
				scoreThreshold: 0.9,
			})
			assert.equal(result.length, 0)
		})
	})

	describe("hybrid retrieval results", () => {
		it("returns entries with scores and source paths", async () => {
			const entries = [createEntry("Cell Monitoring", "Battery cell voltage measurement SWC.")]
			const sourcePath = "/workspace/.cline/bms-autosar/knowledge.json"

			const result = await retrieveRelevantKnowledgeResults({
				sources: [createSource(entries, sourcePath)],
				query: "cell voltage swc",
				apiConfiguration: {},
				topK: 5,
			})

			assert.equal(result.length, 1)
			assert.equal(result[0].entry.topic, "Cell Monitoring")
			assert.equal(result[0].sourcePath, sourcePath)
			assert.ok(result[0].score >= 0 && result[0].score <= 1)
		})

		it("applies the configured hybrid weight", async () => {
			const entries = [createEntry("Cell Monitoring", "Battery cell voltage measurement SWC.")]

			const embeddingWeighted = await retrieveRelevantKnowledgeResults({
				sources: [createSource(entries)],
				query: "cell voltage swc",
				apiConfiguration: {},
				topK: 5,
				hybridWeight: 0.9,
			})

			const lexicalWeighted = await retrieveRelevantKnowledgeResults({
				sources: [createSource(entries)],
				query: "cell voltage swc",
				apiConfiguration: {},
				topK: 5,
				hybridWeight: 0.1,
			})

			assert.equal(embeddingWeighted.length, 1)
			assert.equal(lexicalWeighted.length, 1)
		})
	})
})
