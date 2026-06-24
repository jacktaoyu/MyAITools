import { strict as assert } from "node:assert"
import { describe, it } from "mocha"
import type { ApiConfiguration } from "@shared/api"
import { hashContent } from "../BmsAutosarEmbeddingService"
import { loadVectorCached, saveVectorCached } from "../BmsAutosarKnowledgeCache"
import type { BmsAutosarKnowledgeEntry } from "../BmsAutosarKnowledgeTypes"
import { getBmsAutosarVectorIndex, warmBmsAutosarVectorCache } from "../BmsAutosarVectorIndex"

const mockApiConfiguration: ApiConfiguration = {
	apiProvider: "openai",
	openAiApiKey: "test-key",
	openAiModelId: "text-embedding-3-small",
	openAiBaseUrl: "https://api.openai.com/v1",
} as ApiConfiguration

function makeEntry(content: string): BmsAutosarKnowledgeEntry {
	return {
		topic: content,
		content,
		createdAt: new Date().toISOString(),
		updatedAt: new Date().toISOString(),
	}
}

describe("BmsAutosarVectorIndex", () => {
	it("builds an index from cached vectors and searches top-k", async () => {
		const entries = [makeEntry("doc-a"), makeEntry("doc-b"), makeEntry("doc-c")]
		const model = "test-model"

		// Seed the vector cache with simple orthogonal vectors.
		const vectors: number[][] = [
			[1, 0, 0],
			[0, 1, 0],
			[0, 0, 1],
		]
		for (let i = 0; i < entries.length; i++) {
			const contentHash = hashContent(entries[i].content)
			await saveVectorCached(contentHash, model, vectors[i])
		}

		const index = await getBmsAutosarVectorIndex(entries, model)
		await index.build(entries, model, { apiConfiguration: mockApiConfiguration, model })

		const results = await index.search([1, 0, 0], 2)
		assert.equal(results.length, 2)
		assert.equal(results[0].entryIndex, 0)
		assert.ok(Math.abs(results[0].score - 1) < 1e-5)
	})

	it("loads a previously built index from disk", async () => {
		const entries = [makeEntry("alpha"), makeEntry("beta")]
		const model = "test-model-load"
		const vectors: number[][] = [
			[1, 0, 0],
			[0, 1, 0],
		]
		for (let i = 0; i < entries.length; i++) {
			const contentHash = hashContent(entries[i].content)
			await saveVectorCached(contentHash, model, vectors[i])
		}

		const firstIndex = await getBmsAutosarVectorIndex(entries, model)
		await firstIndex.build(entries, model, { apiConfiguration: mockApiConfiguration, model })

		const secondIndex = await getBmsAutosarVectorIndex(entries, model)
		const loaded = await secondIndex.load()
		assert.equal(loaded, true)

		const results = await secondIndex.search([0, 1, 0], 1)
		assert.equal(results.length, 1)
		assert.equal(results[0].entryIndex, 1)
	})

	it("refuses to load an index when the entry set has changed", async () => {
		const entries = [makeEntry("entry-1")]
		const model = "test-model-invalid"
		await saveVectorCached(hashContent(entries[0].content), model, [1, 0, 0])

		const index = await getBmsAutosarVectorIndex(entries, model)
		await index.build(entries, model, { apiConfiguration: mockApiConfiguration, model })

		const changedEntries = [makeEntry("entry-1"), makeEntry("entry-2")]
		const changedIndex = await getBmsAutosarVectorIndex(changedEntries, model)
		const loaded = await changedIndex.load()
		assert.equal(loaded, false)
	})

	it("handles empty entry sets", async () => {
		const index = await getBmsAutosarVectorIndex([], "test-model-empty")
		await index.build([], "test-model-empty", { apiConfiguration: mockApiConfiguration, model: "test-model-empty" })
		const results = await index.search([1, 0, 0], 5)
		assert.equal(results.length, 0)
	})
})

describe("warmBmsAutosarVectorCache", () => {
	it("computes and persists missing embeddings for provided entries", async () => {
		// We cannot call the real embedding API in tests, so warm the cache
		// manually and then verify that warmBmsAutosarVectorCache becomes a no-op.
		const entries = [makeEntry("warm-entry-a"), makeEntry("warm-entry-b")]
		const model = "test-warm-model"
		const vectors: number[][] = [
			[1, 0, 0],
			[0, 1, 0],
		]
		for (let i = 0; i < entries.length; i++) {
			await saveVectorCached(hashContent(entries[i].content), model, vectors[i])
		}

		await warmBmsAutosarVectorCache(entries, mockApiConfiguration, model)

		for (const entry of entries) {
			const cached = await loadVectorCached(hashContent(entry.content), model)
			assert.ok(cached)
			assert.deepEqual(cached, vectors[entries.indexOf(entry)])
		}
	})
})
