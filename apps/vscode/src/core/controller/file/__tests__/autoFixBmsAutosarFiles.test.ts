import { strict as assert } from "node:assert";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, it } from "mocha";
import type { ApiHandler, ApiHandlerModel } from "@core/api";
import type { ApiStream } from "@core/api/transform/stream";
import type { Controller } from "../..";
import { autoFixBmsAutosarFiles } from "../autoFixBmsAutosarFiles";
import { AutoFixBmsAutosarFilesRequest } from "@shared/proto/cline/file";
import {
	clearQualityReport,
	upsertQualityReportFile,
} from "@core/task/tools/handlers/bms-autosar/BmsAutosarQualityReportStore";
import { HostProvider } from "@/hosts/host-provider";

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

function createMockApiHandler(responseText: string): ApiHandler {
	return {
		getModel: () => ({ id: "mock" }) as ApiHandlerModel,
		createMessage: async function* (): ApiStream {
			yield { type: "text", text: responseText };
		},
	} as unknown as ApiHandler;
}

describe("autoFixBmsAutosarFiles", () => {
	let tempDir: string;

	beforeEach(async () => {
		tempDir = await fs.mkdtemp(
			path.join(os.tmpdir(), "bms-autofix-batch-test-"),
		);
		initHostProviderWithCwd(tempDir);
		clearQualityReport(tempDir);
	});

	afterEach(async () => {
		await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
		if (HostProvider.isInitialized()) {
			HostProvider.reset();
		}
	});

	it("returns an error when no file paths are provided", async () => {
		const result = await autoFixBmsAutosarFiles(
			{} as unknown as Controller,
			AutoFixBmsAutosarFilesRequest.create({ filePaths: [] }),
			createMockApiHandler(""),
		);

		assert.equal(result.totalCount, 0);
		assert.equal(result.fixedCount, 0);
		assert.ok(result.message.includes("At least one file_path"));
	});

	it("generates previews for multiple files without writing to disk", async () => {
		const fileA = path.join(tempDir, "BmsA.c");
		const fileB = path.join(tempDir, "BmsB.c");
		await fs.writeFile(fileA, "void A(void) { malloc(1); }\n", "utf-8");
		await fs.writeFile(fileB, 'void B(void) { printf("hi"); }\n', "utf-8");

		upsertQualityReportFile(tempDir, "BmsA.c", [
			{
				severity: "error",
				message: "malloc not allowed",
				rule: "R21.3",
				line: 1,
			},
		]);
		upsertQualityReportFile(tempDir, "BmsB.c", [
			{
				severity: "warning",
				message: "printf not allowed",
				rule: "R21.6",
				line: 1,
			},
		]);

		const api = createMockApiHandler("```c\nvoid Fixed(void) { }\n```");

		const result = await autoFixBmsAutosarFiles(
			{} as unknown as Controller,
			AutoFixBmsAutosarFilesRequest.create({
				filePaths: [fileA, fileB],
				apply: false,
			}),
			api,
		);

		assert.equal(result.totalCount, 2);
		assert.equal(result.fixedCount, 2);
		assert.equal(result.appliedCount, 0);
		assert.equal(result.results.length, 2);
		assert.ok(result.results.every((r) => r.fixed && !r.applied));
		assert.ok(result.results.some((r) => r.filePath === "BmsA.c"));
		assert.ok(result.results.some((r) => r.filePath === "BmsB.c"));

		// Original files should remain unchanged.
		assert.equal(
			await fs.readFile(fileA, "utf-8"),
			"void A(void) { malloc(1); }\n",
		);
		assert.equal(
			await fs.readFile(fileB, "utf-8"),
			'void B(void) { printf("hi"); }\n',
		);
	});

	it("applies fixes to multiple files when apply=true", async () => {
		const fileA = path.join(tempDir, "BmsA.c");
		const fileB = path.join(tempDir, "BmsB.c");
		await fs.writeFile(fileA, "void A(void) { malloc(1); }\n", "utf-8");
		await fs.writeFile(fileB, 'void B(void) { printf("hi"); }\n', "utf-8");

		upsertQualityReportFile(tempDir, "BmsA.c", [
			{
				severity: "error",
				message: "malloc not allowed",
				rule: "R21.3",
				line: 1,
			},
		]);
		upsertQualityReportFile(tempDir, "BmsB.c", [
			{
				severity: "warning",
				message: "printf not allowed",
				rule: "R21.6",
				line: 1,
			},
		]);

		const api = createMockApiHandler("```c\nvoid Fixed(void) { }\n```");

		const result = await autoFixBmsAutosarFiles(
			{} as unknown as Controller,
			AutoFixBmsAutosarFilesRequest.create({
				filePaths: [fileA, fileB],
				apply: true,
			}),
			api,
		);

		assert.equal(result.totalCount, 2);
		assert.equal(result.fixedCount, 2);
		assert.equal(result.appliedCount, 2);
		assert.ok(result.results.every((r) => r.fixed && r.applied));

		assert.equal(await fs.readFile(fileA, "utf-8"), "void Fixed(void) { }\n");
		assert.equal(await fs.readFile(fileB, "utf-8"), "void Fixed(void) { }\n");
	});

	it("continues processing remaining files when one file has no recorded issues", async () => {
		const fileA = path.join(tempDir, "BmsA.c");
		const fileB = path.join(tempDir, "BmsB.c");
		await fs.writeFile(fileA, "void A(void) { malloc(1); }\n", "utf-8");
		await fs.writeFile(fileB, "void B(void) { }\n", "utf-8");

		// Only file A has issues.
		upsertQualityReportFile(tempDir, "BmsA.c", [
			{
				severity: "error",
				message: "malloc not allowed",
				rule: "R21.3",
				line: 1,
			},
		]);

		const api = createMockApiHandler("```c\nvoid Fixed(void) { }\n```");

		const result = await autoFixBmsAutosarFiles(
			{} as unknown as Controller,
			AutoFixBmsAutosarFilesRequest.create({
				filePaths: [fileA, fileB],
				apply: false,
			}),
			api,
		);

		assert.equal(result.totalCount, 2);
		assert.equal(result.fixedCount, 1);
		assert.equal(result.results.length, 2);
		const resultA = result.results.find((r) => r.filePath === "BmsA.c");
		const resultB = result.results.find((r) => r.filePath === "BmsB.c");
		assert.ok(resultA?.fixed);
		assert.ok(!resultB?.fixed);
	});
});
