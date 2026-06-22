import { strict as assert } from "node:assert";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, it } from "mocha";
import { BmsKnowledgeListRequest } from "@shared/proto/cline/file";
import { HostProvider } from "@/hosts/host-provider";
import { listBmsKnowledge } from "../listBmsKnowledge";

// Mock controller is not used by listBmsKnowledge.
const mockController = {} as any;

function initHostProviderWithCwd(cwd: string) {
	if (HostProvider.isInitialized()) {
		HostProvider.reset();
	}
	HostProvider.initialize(
		() => ({}) as any,
		() => ({}) as any,
		() => ({}) as any,
		() => ({}) as any,
		{
			workspaceClient: {
				getWorkspacePaths: async () => ({ paths: [cwd] }),
			},
		} as any,
		() => {},
		async () => "",
		async () => "",
		"",
		"",
	);
}

describe("listBmsKnowledge", () => {
	let tempDir: string;

	beforeEach(async () => {
		tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "bms-kb-test-"));
		await fs.mkdir(path.join(tempDir, ".cline", "bms-autosar"), {
			recursive: true,
		});
		initHostProviderWithCwd(tempDir);
	});

	afterEach(async () => {
		await fs.rm(tempDir, { recursive: true, force: true });
		if (HostProvider.isInitialized()) {
			HostProvider.reset();
		}
	});

	it("returns an empty list when no knowledge file exists", async () => {
		const result = await listBmsKnowledge(
			mockController,
			BmsKnowledgeListRequest.create({ scope: "workspace" }),
		);
		assert.deepStrictEqual(result.entries, []);
	});

	it("lists entries with tags and embedding status", async () => {
		const kbPath = path.join(
			tempDir,
			".cline",
			"bms-autosar",
			"knowledge.json",
		);
		const data = {
			version: "1.0.0",
			entries: [
				{
					topic: "Cell Voltage",
					content: "Cell voltage measurement guidance.",
					updatedAt: "2026-06-21T00:00:00.000Z",
					tags: ["arxml", "requirements"],
					embedding: {
						model: "text-embedding-3-small",
						contentHash: "stale-hash",
					},
				},
			],
		};
		await fs.writeFile(kbPath, JSON.stringify(data, null, 2), "utf-8");

		const result = await listBmsKnowledge(
			mockController,
			BmsKnowledgeListRequest.create({ scope: "workspace" }),
		);

		assert.equal(result.entries.length, 1);
		const entry = result.entries[0];
		assert.equal(entry.topic, "Cell Voltage");
		assert.deepStrictEqual(entry.tags, ["arxml", "requirements"]);
		assert.equal(entry.hasEmbedding, true);
		assert.equal(entry.embeddingStale, true);
		assert.ok(entry.content.includes("Cell voltage measurement"));
	});
});
