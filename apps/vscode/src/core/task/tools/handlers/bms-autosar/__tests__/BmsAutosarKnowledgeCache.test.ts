import { strict as assert } from "node:assert"
import fs from "node:fs/promises"
import path from "node:path"
import { describe, it, beforeEach, afterEach } from "mocha"
import {
	findAndLoadTemplatesCached,
	invalidateBmsAutosarKnowledgeCache,
	loadArxmlGraphCached,
	loadBmsAutosarKnowledgeBaseWithSourcesCached,
	loadKnowledgeSourceCached,
	loadTemplatesCached,
	saveArxmlGraphCached,
} from "../BmsAutosarKnowledgeCache"
import { buildArxmlKnowledgeGraph } from "../BmsAutosarKnowledgeGraph"

describe("BmsAutosarKnowledgeCache", () => {
	let tempDir = ""

	beforeEach(async () => {
		tempDir = await fs.mkdtemp("/tmp/bms-cache-test-")
		invalidateBmsAutosarKnowledgeCache()
	})

	afterEach(async () => {
		await fs.rm(tempDir, { recursive: true, force: true })
		invalidateBmsAutosarKnowledgeCache()
	})

	it("caches templates.json and skips re-reading when mtime is unchanged", async () => {
		const templatesPath = path.join(tempDir, "templates.json")
		const templates = { version: "3.0.0", templates: {} }
		await fs.writeFile(templatesPath, JSON.stringify(templates), "utf-8")

		const first = await loadTemplatesCached(templatesPath)
		const second = await loadTemplatesCached(templatesPath)

		assert.deepStrictEqual(first, templates)
		assert.deepStrictEqual(second, templates)
	})

	it("reloads templates.json when the file is modified", async () => {
		const templatesPath = path.join(tempDir, "templates.json")
		await fs.writeFile(templatesPath, JSON.stringify({ version: "1.0.0", templates: {} }), "utf-8")

		const first = await loadTemplatesCached(templatesPath)
		assert.equal(first?.version, "1.0.0")

		await new Promise((resolve) => setTimeout(resolve, 20))
		await fs.writeFile(templatesPath, JSON.stringify({ version: "2.0.0", templates: {} }), "utf-8")

		const second = await loadTemplatesCached(templatesPath)
		assert.equal(second?.version, "2.0.0")
	})

	it("caches knowledge sources and skips re-reading when mtime is unchanged", async () => {
		const knowledgePath = path.join(tempDir, "knowledge.json")
		const data = { version: "1.0.0", entries: [{ topic: "A", content: "content", createdAt: "", updatedAt: "" }] }
		await fs.writeFile(knowledgePath, JSON.stringify(data), "utf-8")

		const first = await loadKnowledgeSourceCached(knowledgePath)
		const second = await loadKnowledgeSourceCached(knowledgePath)

		assert.equal(first?.entries.length, 1)
		assert.equal(second?.entries.length, 1)
		assert.equal(first, second)
	})

	it("reloads knowledge source when the file is modified", async () => {
		const knowledgePath = path.join(tempDir, "knowledge.json")
		const data = { version: "1.0.0", entries: [{ topic: "A", content: "content", createdAt: "", updatedAt: "" }] }
		await fs.writeFile(knowledgePath, JSON.stringify(data), "utf-8")

		const first = await loadKnowledgeSourceCached(knowledgePath)
		assert.equal(first?.entries[0].topic, "A")

		await new Promise((resolve) => setTimeout(resolve, 20))
		const updated = {
			version: "1.0.0",
			entries: [{ topic: "B", content: "content", createdAt: "", updatedAt: "" }],
		}
		await fs.writeFile(knowledgePath, JSON.stringify(updated), "utf-8")

		const second = await loadKnowledgeSourceCached(knowledgePath)
		assert.equal(second?.entries[0].topic, "B")
	})

	it("returns undefined and clears cache entry when knowledge file is deleted", async () => {
		const knowledgePath = path.join(tempDir, "knowledge.json")
		const data = { version: "1.0.0", entries: [{ topic: "A", content: "content", createdAt: "", updatedAt: "" }] }
		await fs.writeFile(knowledgePath, JSON.stringify(data), "utf-8")

		const first = await loadKnowledgeSourceCached(knowledgePath)
		assert.ok(first)

		await fs.unlink(knowledgePath)
		const second = await loadKnowledgeSourceCached(knowledgePath)
		assert.equal(second, undefined)
	})

	it("findAndLoadTemplatesCached falls back when no candidate exists", async () => {
		const fallback = { version: "0.0.0", templates: {} }
		const result = await findAndLoadTemplatesCached([path.join(tempDir, "missing.json")], fallback)
		assert.deepStrictEqual(result, fallback)
	})

	it("invalidates a specific knowledge path without clearing the whole cache", async () => {
		const knowledgePath = path.join(tempDir, "knowledge.json")
		const templatesPath = path.join(tempDir, "templates.json")
		await fs.writeFile(knowledgePath, JSON.stringify({ version: "1.0.0", entries: [] }), "utf-8")
		await fs.writeFile(templatesPath, JSON.stringify({ version: "1.0.0", templates: {} }), "utf-8")

		await loadKnowledgeSourceCached(knowledgePath)
		await loadTemplatesCached(templatesPath)

		invalidateBmsAutosarKnowledgeCache(knowledgePath)

		const reloaded = await loadKnowledgeSourceCached(knowledgePath)
		assert.ok(reloaded)
	})

	it("caches and reloads an ARXML graph by mtime", async () => {
		const arxmlPath = path.join(tempDir, "sample.arxml")
		const arxml = `<?xml version="1.0" encoding="UTF-8"?>
<AUTOSAR>
  <AR-PACKAGES>
    <AR-PACKAGE>
      <SHORT-NAME>BmsPackage</SHORT-NAME>
      <ELEMENTS>
        <APPLICATION-SW-COMPONENT-TYPE>
          <SHORT-NAME>BmsCellMonitor</SHORT-NAME>
        </APPLICATION-SW-COMPONENT-TYPE>
      </ELEMENTS>
    </AR-PACKAGE>
  </AR-PACKAGES>
</AUTOSAR>`
		await fs.writeFile(arxmlPath, arxml, "utf-8")
		const stat = await fs.stat(arxmlPath)
		const graph = buildArxmlKnowledgeGraph(arxml)

		await saveArxmlGraphCached(arxmlPath, stat.mtimeMs, graph)
		const cached = await loadArxmlGraphCached(arxmlPath)

		assert.ok(cached)
		assert.equal(cached?.nodes.size, graph.nodes.size)
		assert.deepStrictEqual(cached?.edges, graph.edges)
	})

	it("invalidates the ARXML graph cache when the file changes", async () => {
		const arxmlPath = path.join(tempDir, "sample.arxml")
		const arxml = `<?xml version="1.0" encoding="UTF-8"?>
<AUTOSAR>
  <AR-PACKAGES>
    <AR-PACKAGE>
      <SHORT-NAME>BmsPackage</SHORT-NAME>
    </AR-PACKAGE>
  </AR-PACKAGES>
</AUTOSAR>`
		await fs.writeFile(arxmlPath, arxml, "utf-8")
		const stat = await fs.stat(arxmlPath)
		const graph = buildArxmlKnowledgeGraph(arxml)
		await saveArxmlGraphCached(arxmlPath, stat.mtimeMs, graph)

		await new Promise((resolve) => setTimeout(resolve, 20))
		await fs.writeFile(arxmlPath, arxml.replace("BmsPackage", "BmsPackage2"), "utf-8")

		const cached = await loadArxmlGraphCached(arxmlPath)
		assert.equal(cached, undefined)
	})

	it("loads workspace knowledge source with caching", async () => {
		const workspaceDir = path.join(tempDir, "workspace")
		const workspacePath = path.join(workspaceDir, ".cline", "bms-autosar", "knowledge.json")

		await fs.mkdir(path.dirname(workspacePath), { recursive: true })
		await fs.writeFile(
			workspacePath,
			JSON.stringify({ version: "1.0.0", entries: [{ topic: "W", content: "w", createdAt: "", updatedAt: "" }] }),
			"utf-8",
		)

		const sources = await loadBmsAutosarKnowledgeBaseWithSourcesCached(workspaceDir)
		assert.equal(sources.length, 1)
		assert.equal(sources[0].entries[0].topic, "W")
	})
})
