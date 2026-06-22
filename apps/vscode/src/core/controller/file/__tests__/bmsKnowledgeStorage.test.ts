import { strict as assert } from "node:assert";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, it } from "mocha";
import {
	getBmsKnowledgeDir,
	saveBmsKnowledgeContent,
} from "../bmsKnowledgeStorage";

describe("bmsKnowledgeStorage", () => {
	let tempDir: string;
	let globalTempDir: string;

	beforeEach(async () => {
		tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "bms-kb-storage-test-"));
		globalTempDir = await fs.mkdtemp(
			path.join(os.tmpdir(), "bms-kb-global-test-"),
		);
	});

	afterEach(async () => {
		await fs.rm(tempDir, { recursive: true, force: true });
		await fs.rm(globalTempDir, { recursive: true, force: true });
	});

	it("saves a short knowledge entry to workspace scope", async () => {
		const { chunkCount, kbPath } = await saveBmsKnowledgeContent({
			cwd: tempDir,
			scope: "workspace",
			topic: "Naming",
			content: "Use Bms_ prefix.",
			tags: ["naming"],
		});

		assert.equal(chunkCount, 0);
		assert.equal(
			kbPath,
			path.join(tempDir, ".cline", "bms-autosar", "knowledge.json"),
		);

		const raw = await fs.readFile(kbPath, "utf-8");
		const data = JSON.parse(raw);
		assert.equal(data.entries.length, 1);
		assert.equal(data.entries[0].topic, "Naming");
		assert.equal(data.entries[0].content, "Use Bms_ prefix.");
		assert.deepStrictEqual(data.entries[0].tags, ["naming"]);
	});

	it("chunks large content and records source files", async () => {
		const content = "word ".repeat(5000);
		const { chunkCount, kbPath } = await saveBmsKnowledgeContent({
			cwd: tempDir,
			topic: "Large",
			content,
			tags: ["bulk"],
			sourceFiles: ["a.txt", "b.txt"],
		});

		assert.ok(chunkCount > 1);

		const raw = await fs.readFile(kbPath, "utf-8");
		const data = JSON.parse(raw);
		assert.equal(data.entries.length, chunkCount);
		assert.equal(data.entries[0].topic, "Large - Chunk 1/" + chunkCount);
		assert.deepStrictEqual(data.entries[0].sourceFiles, ["a.txt", "b.txt"]);
		// All chunks should carry the source files for traceability.
		for (const entry of data.entries) {
			assert.deepStrictEqual(entry.sourceFiles, ["a.txt", "b.txt"]);
		}
	});

	it("replaces previous entries and chunks for the same topic", async () => {
		const kbPath = path.join(
			tempDir,
			".cline",
			"bms-autosar",
			"knowledge.json",
		);
		await fs.mkdir(path.dirname(kbPath), { recursive: true });
		await fs.writeFile(
			kbPath,
			JSON.stringify(
				{
					version: "1.0.0",
					entries: [
						{ topic: "Old", content: "old", createdAt: "1", updatedAt: "1" },
						{
							topic: "Old - Chunk 1/2",
							content: "old chunk",
							createdAt: "1",
							updatedAt: "1",
						},
					],
				},
				null,
				2,
			),
			"utf-8",
		);

		await saveBmsKnowledgeContent({
			cwd: tempDir,
			topic: "Old",
			content: "New content.",
		});

		const raw = await fs.readFile(kbPath, "utf-8");
		const data = JSON.parse(raw);
		assert.equal(data.entries.length, 1);
		assert.equal(data.entries[0].topic, "Old");
		assert.equal(data.entries[0].content, "New content.");
	});

	it("computes workspace and global knowledge directories", () => {
		assert.ok(
			getBmsKnowledgeDir(tempDir, "workspace").includes(
				path.join(".cline", "bms-autosar"),
			),
		);
		assert.ok(
			getBmsKnowledgeDir(tempDir, "global").includes(
				path.join(os.homedir(), ".cline", "bms-autosar"),
			),
		);
	});
});
