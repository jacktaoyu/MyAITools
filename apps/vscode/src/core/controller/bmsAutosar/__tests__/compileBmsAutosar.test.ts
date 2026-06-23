import { strict as assert } from "node:assert";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, it } from "mocha";
import type { Controller } from "../..";
import { compileBmsAutosar } from "../compileBmsAutosar";
import { loadBmsCompileProfiles } from "@core/task/tools/handlers/bms-autosar/BmsAutosarCompileProfileStorage";
import { HostProvider } from "@/hosts/host-provider";
import { CompileBmsAutosarRequest } from "@shared/proto/cline/bms_autosar";

function initHostProviderWithCwd(cwd: string, commandSuccess = true) {
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
				executeCommandInTerminal: async () => ({ success: commandSuccess }),
			},
		} as any,
		() => {},
		async () => "",
		async () => "",
		"",
		"",
	);
}

describe("compileBmsAutosar", () => {
	let tempDir: string;

	beforeEach(async () => {
		tempDir = await fs.mkdtemp(
			path.join(os.tmpdir(), "bms-compile-ctrl-test-"),
		);
	});

	afterEach(async () => {
		await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
		if (HostProvider.isInitialized()) {
			HostProvider.reset();
		}
	});

	it("runs the built-in appl profile and persists the selection", async () => {
		initHostProviderWithCwd(tempDir);
		const response = await compileBmsAutosar(
			{} as unknown as Controller,
			CompileBmsAutosarRequest.create({ profileId: "appl-m" }),
		);
		assert.equal(response.success, true);
		assert.equal(
			response.command,
			`cd "${path.join(tempDir, "appl")}" && m -j32`,
		);
		const data = await loadBmsCompileProfiles(tempDir, "workspace");
		assert.equal(data.lastSelectedId, "appl-m");
	});

	it("runs the built-in launch profile", async () => {
		initHostProviderWithCwd(tempDir);
		const response = await compileBmsAutosar(
			{} as unknown as Controller,
			CompileBmsAutosarRequest.create({ profileId: "launch-make" }),
		);
		assert.equal(response.success, true);
		assert.equal(
			response.command,
			`cd "${tempDir}" && launch.bat && make -j32`,
		);
	});

	it("returns failure response when terminal command fails", async () => {
		initHostProviderWithCwd(tempDir, false);
		const response = await compileBmsAutosar(
			{} as unknown as Controller,
			CompileBmsAutosarRequest.create({ profileId: "appl-m" }),
		);
		assert.equal(response.success, false);
	});

	it("throws when profile is not found", async () => {
		initHostProviderWithCwd(tempDir);
		await assert.rejects(
			compileBmsAutosar(
				{} as unknown as Controller,
				CompileBmsAutosarRequest.create({ profileId: "missing" }),
			),
			/not found/,
		);
	});
});
