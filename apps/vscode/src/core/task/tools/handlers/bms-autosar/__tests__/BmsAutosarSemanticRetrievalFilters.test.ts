import { strict as assert } from "node:assert"
import { describe, it } from "mocha"
import type { BmsAutosarKnowledgeEntry, BmsAutosarKnowledgeSource } from "../BmsAutosarKnowledgeTypes"
import { retrieveRelevantKnowledgeEntries } from "../BmsAutosarSemanticRetrieval"

function createEntry(
	topic: string,
	content: string,
	options: { tags?: string[]; sourceFiles?: string[] } = {},
): BmsAutosarKnowledgeEntry {
	return {
		topic,
		content,
		createdAt: new Date().toISOString(),
		updatedAt: new Date().toISOString(),
		tags: options.tags,
		sourceFiles: options.sourceFiles,
	}
}

function createSource(entries: BmsAutosarKnowledgeEntry[], sourcePath = "/tmp/knowledge.json"): BmsAutosarKnowledgeSource {
	return { path: sourcePath, entries }
}

describe("BmsAutosarSemanticRetrieval metadata filters", () => {
	it("returns only entries matching the requested tags", async () => {
		const entries = [
			createEntry("Cell Monitor", "Measures cell voltages.", { tags: ["cell", "swc"] }),
			createEntry("Contactor Driver", "Controls HV contactors.", { tags: ["controller", "safety"] }),
			createEntry("Thermal Manager", "Manages cell temperatures.", { tags: ["thermal"] }),
		]

		const result = await retrieveRelevantKnowledgeEntries({
			sources: [createSource(entries)],
			query: "battery",
			apiConfiguration: {},
			topK: 5,
			tags: ["cell"],
		})

		assert.equal(result.length, 1)
		assert.equal(result[0].topic, "Cell Monitor")
	})

	it("returns only entries matching the requested source files", async () => {
		const entries = [
			createEntry("From Requirements", "Requirements text.", { sourceFiles: ["docs/req.md"] }),
			createEntry("From Arxml", "ARXML content.", { sourceFiles: ["models/bms.arxml"] }),
		]

		const result = await retrieveRelevantKnowledgeEntries({
			sources: [createSource(entries)],
			query: "content",
			apiConfiguration: {},
			topK: 5,
			sourceFiles: ["models/bms.arxml"],
		})

		assert.equal(result.length, 1)
		assert.equal(result[0].topic, "From Arxml")
	})

	it("returns empty when no entries match the filters", async () => {
		const entries = [createEntry("Cell Monitor", "Measures cell voltages.", { tags: ["cell"] })]

		const result = await retrieveRelevantKnowledgeEntries({
			sources: [createSource(entries)],
			query: "cell",
			apiConfiguration: {},
			topK: 5,
			tags: ["thermal"],
		})

		assert.deepStrictEqual(result, [])
	})

	it("applies tag filtering case-insensitively", async () => {
		const entries = [createEntry("Cell Monitor", "Measures cell voltages.", { tags: ["Cell"] })]

		const result = await retrieveRelevantKnowledgeEntries({
			sources: [createSource(entries)],
			query: "cell",
			apiConfiguration: {},
			topK: 5,
			tags: ["cell"],
		})

		assert.equal(result.length, 1)
	})
})
