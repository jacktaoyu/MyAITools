import { strict as assert } from "node:assert"
import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { afterEach, beforeEach, describe, it } from "mocha"
import {
	deleteBmsTemplate,
	getBmsTemplatesDir,
	loadBmsTemplates,
	loadMergedTemplates,
	saveBmsTemplate,
} from "../BmsAutosarTemplateStorage"

const customTemplate = {
	component_type: "my_swc",
	default_ports: [],
	default_runnables: [],
	header_template: "#ifndef MY_H\n#define MY_H\n#endif",
	c_template: "#include \"My.h\"",
	arxml_template: "<AUTOSAR></AUTOSAR>",
}

describe("BmsAutosarTemplateStorage", () => {
	let tempDir: string

	beforeEach(async () => {
		tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "bms-template-test-"))
	})

	afterEach(async () => {
		await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {})
	})

	it("returns empty templates when no file exists", async () => {
		const data = await loadBmsTemplates(tempDir, "workspace")
		assert.equal(Object.keys(data.templates).length, 0)
		assert.equal(data.version, "1.0.0")
	})

	it("saves and loads a workspace template", async () => {
		await saveBmsTemplate(tempDir, "workspace", "my_swc", customTemplate)
		const data = await loadBmsTemplates(tempDir, "workspace")
		assert.deepEqual(data.templates["my_swc"], customTemplate)
	})

	it("saves templates in separate workspace and global directories", async () => {
		await saveBmsTemplate(tempDir, "workspace", "ws_template", customTemplate)
		const globalDir = path.join(os.homedir(), ".cline", "bms-autosar")
		await saveBmsTemplate(tempDir, "global", "global_template", customTemplate)

		const wsData = await loadBmsTemplates(tempDir, "workspace")
		const globalData = await loadBmsTemplates(tempDir, "global")

		assert.ok(wsData.templates["ws_template"])
		assert.ok(!wsData.templates["global_template"])
		assert.ok(globalData.templates["global_template"])
		assert.ok(!globalData.templates["ws_template"])

		// Clean up global test file.
		await fs.rm(path.join(globalDir, "templates.json"), { force: true }).catch(() => {})
	})

	it("deletes a template", async () => {
		await saveBmsTemplate(tempDir, "workspace", "to_delete", customTemplate)
		const deleted = await deleteBmsTemplate(tempDir, "workspace", "to_delete")
		assert.equal(deleted, true)
		const data = await loadBmsTemplates(tempDir, "workspace")
		assert.ok(!data.templates["to_delete"])
	})

	it("returns false when deleting a non-existent template", async () => {
		const deleted = await deleteBmsTemplate(tempDir, "workspace", "missing")
		assert.equal(deleted, false)
	})

	it("merges built-in, global, and workspace templates with correct precedence", async () => {
		const builtIn = {
			version: "1.0.0",
			templates: {
				shared: { ...customTemplate, component_type: "shared", header_template: "builtin" },
				builtin_only: { ...customTemplate, component_type: "builtin_only" },
			},
		}

		await saveBmsTemplate(tempDir, "global", "shared", { ...customTemplate, component_type: "shared", header_template: "global" })
		await saveBmsTemplate(tempDir, "global", "global_only", { ...customTemplate, component_type: "global_only" })
		await saveBmsTemplate(tempDir, "workspace", "shared", { ...customTemplate, component_type: "shared", header_template: "workspace" })
		await saveBmsTemplate(tempDir, "workspace", "workspace_only", { ...customTemplate, component_type: "workspace_only" })

		const merged = await loadMergedTemplates(tempDir, builtIn)

		assert.equal(merged.templates["shared"].header_template, "workspace")
		assert.equal(merged.templates["global_only"].component_type, "global_only")
		assert.equal(merged.templates["workspace_only"].component_type, "workspace_only")
		assert.equal(merged.templates["builtin_only"].component_type, "builtin_only")
	})

	it("returns the expected templates directory", () => {
		assert.equal(getBmsTemplatesDir(tempDir, "workspace"), path.join(tempDir, ".cline", "bms-autosar"))
		assert.equal(getBmsTemplatesDir(tempDir, "global"), path.join(os.homedir(), ".cline", "bms-autosar"))
	})
})
