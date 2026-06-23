import { strict as assert } from "node:assert";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, it } from "mocha";
import {
	BUILTIN_COMPILE_PROFILES,
	buildBmsCompileCommand,
	deleteBmsCompileProfile,
	getBmsCompileProfilesDir,
	getMergedBmsCompileProfiles,
	loadBmsCompileProfiles,
	saveBmsCompileProfile,
	setLastSelectedCompileProfile,
} from "../BmsAutosarCompileProfileStorage";

describe("BmsAutosarCompileProfileStorage", () => {
	let tempDir: string;

	beforeEach(async () => {
		tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "bms-compile-test-"));
	});

	afterEach(async () => {
		await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
		const globalDir = path.join(os.homedir(), ".cline", "bms-autosar");
		await fs.rm(path.join(globalDir, "compile-profiles.json"), { force: true }).catch(() => {});
	});

	it("returns built-in profiles and default selection when no file exists", async () => {
		const { profiles, lastSelectedId } = await getMergedBmsCompileProfiles(tempDir);
		const ids = profiles.map((p) => p.id);
		assert.ok(ids.includes("appl-m"));
		assert.ok(ids.includes("launch-make"));
		assert.equal(lastSelectedId, "appl-m");
	});

	it("saves and loads a workspace profile", async () => {
		await saveBmsCompileProfile(tempDir, "workspace", {
			id: "my-profile",
			name: "My Profile",
			workflow: "appl",
			workingDirRelative: "appl",
			jobs: 16,
		});
		const data = await loadBmsCompileProfiles(tempDir, "workspace");
		assert.equal(data.profiles.length, 1);
		assert.equal(data.profiles[0].name, "My Profile");
	});

	it("rejects saving a profile with a built-in id", async () => {
		await assert.rejects(
			saveBmsCompileProfile(tempDir, "workspace", {
				id: "appl-m",
				name: "Duplicate",
				workflow: "appl",
			}),
			/conflicts with a built-in profile/,
		);
	});

	it("persists last selected profile id", async () => {
		await saveBmsCompileProfile(tempDir, "workspace", {
			id: "custom",
			name: "Custom",
			workflow: "launch",
		});
		await setLastSelectedCompileProfile(tempDir, "workspace", "custom");
		const data = await loadBmsCompileProfiles(tempDir, "workspace");
		assert.equal(data.lastSelectedId, "custom");
	});

	it("deletes a custom profile and resets last selected if needed", async () => {
		await saveBmsCompileProfile(tempDir, "workspace", {
			id: "to-delete",
			name: "To Delete",
			workflow: "appl",
		});
		await setLastSelectedCompileProfile(tempDir, "workspace", "to-delete");
		const deleted = await deleteBmsCompileProfile(tempDir, "workspace", "to-delete");
		assert.equal(deleted, true);
		const data = await loadBmsCompileProfiles(tempDir, "workspace");
		assert.equal(data.profiles.length, 0);
		assert.equal(data.lastSelectedId, BUILTIN_COMPILE_PROFILES[0].id);
	});

	it("does not delete built-in profiles", async () => {
		const deleted = await deleteBmsCompileProfile(tempDir, "workspace", "appl-m");
		assert.equal(deleted, false);
	});

	it("builds the default appl command", () => {
		const command = buildBmsCompileCommand("/workspace", {
			id: "appl-m",
			name: "Appl",
			workflow: "appl",
			workingDirRelative: "appl",
			jobs: 32,
		});
		assert.equal(command, 'cd "/workspace/appl" && m -j32');
	});

	it("builds the default launch command", () => {
		const command = buildBmsCompileCommand("/workspace", {
			id: "launch-make",
			name: "Launch",
			workflow: "launch",
			jobs: 32,
		});
		assert.equal(command, 'cd "/workspace" && launch.bat && make -j32');
	});

	it("returns the expected profiles directory", () => {
		assert.equal(getBmsCompileProfilesDir(tempDir, "workspace"), path.join(tempDir, ".cline", "bms-autosar"));
		assert.equal(getBmsCompileProfilesDir(tempDir, "global"), path.join(os.homedir(), ".cline", "bms-autosar"));
	});
});
