import { strict as assert } from "node:assert"
import { describe, it } from "mocha"
import { createEmbedding, createEmbeddings, hashContent } from "../BmsAutosarEmbeddingService"

describe("BmsAutosarEmbeddingService", () => {
	describe("hashContent", () => {
		it("returns a stable SHA-256 hex digest", () => {
			const text = "BMS AUTOSAR cell voltage monitoring"
			const first = hashContent(text)
			const second = hashContent(text)
			assert.equal(first, second)
			assert.match(first, /^[a-f0-9]{64}$/)
		})

		it("returns different hashes for different content", () => {
			const a = hashContent("content a")
			const b = hashContent("content b")
			assert.notEqual(a, b)
		})
	})

	describe("createEmbedding", () => {
		it("returns undefined when no API key is configured", async () => {
			const result = await createEmbedding("BMS cell voltage", {
				apiConfiguration: {},
				model: "text-embedding-3-small",
			})
			assert.equal(result, undefined)
		})

		it("returns undefined for empty input", async () => {
			const result = await createEmbedding("   ", {
				apiConfiguration: { openAiApiKey: "sk-test" },
				model: "text-embedding-3-small",
			})
			assert.equal(result, undefined)
		})
	})

	describe("createEmbeddings", () => {
		it("returns undefined for all entries when no API key is configured", async () => {
			const result = await createEmbeddings(["first", "second"], {
				apiConfiguration: {},
				model: "text-embedding-3-small",
			})
			assert.deepStrictEqual(result, [undefined, undefined])
		})

		it("returns an empty array for empty input", async () => {
			const result = await createEmbeddings([], {
				apiConfiguration: { openAiApiKey: "sk-test" },
				model: "text-embedding-3-small",
			})
			assert.deepStrictEqual(result, [])
		})

		it("returns undefined for empty or whitespace-only texts", async () => {
			const result = await createEmbeddings(["", "   "], {
				apiConfiguration: { openAiApiKey: "sk-test" },
				model: "text-embedding-3-small",
			})
			assert.deepStrictEqual(result, [undefined, undefined])
		})
	})
})
