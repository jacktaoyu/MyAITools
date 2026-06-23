import fs from "node:fs/promises";
import path from "node:path";
import { fileExistsAtPath } from "@utils/fs";
import { getClineHomePath } from "@core/storage/disk";

export type BmsAutosarCompileProfileScope = "workspace" | "global";

export interface BmsAutosarCompileProfile {
	id: string;
	name: string;
	workflow: "appl" | "launch";
	/** Optional explicit command. When omitted, the handler builds a default command. */
	command?: string;
	/** Working directory relative to the workspace root (e.g. "appl" or empty). */
	workingDirRelative?: string;
	/** Parallel job count passed to `-j` (default 32). */
	jobs?: number;
}

export interface BmsAutosarCompileProfilesData {
	version: string;
	lastSelectedId: string;
	profiles: BmsAutosarCompileProfile[];
}

export interface MergedBmsAutosarCompileProfile extends BmsAutosarCompileProfile {
	isBuiltin: boolean;
	scope: BmsAutosarCompileProfileScope | "";
}

const PROFILES_FILE_NAME = "compile-profiles.json";

export const BUILTIN_COMPILE_PROFILES: BmsAutosarCompileProfile[] = [
	{
		id: "appl-m",
		name: "Appl: m -j32",
		workflow: "appl",
		workingDirRelative: "appl",
		jobs: 32,
	},
	{
		id: "launch-make",
		name: "Root: launch.bat → make -j32",
		workflow: "launch",
		workingDirRelative: "",
		jobs: 32,
	},
];

function createEmptyProfiles(): BmsAutosarCompileProfilesData {
	return { version: "1.0.0", lastSelectedId: BUILTIN_COMPILE_PROFILES[0].id, profiles: [] };
}

export function getBmsCompileProfilesDir(
	cwd: string,
	scope: BmsAutosarCompileProfileScope = "workspace",
): string {
	if (scope === "global") {
		return path.join(getClineHomePath(), "bms-autosar");
	}
	return path.join(cwd, ".cline", "bms-autosar");
}

function getProfilesPath(cwd: string, scope: BmsAutosarCompileProfileScope): string {
	return path.join(getBmsCompileProfilesDir(cwd, scope), PROFILES_FILE_NAME);
}

export async function loadBmsCompileProfiles(
	cwd: string,
	scope: BmsAutosarCompileProfileScope = "workspace",
): Promise<BmsAutosarCompileProfilesData> {
	const profilesPath = getProfilesPath(cwd, scope);
	if (!(await fileExistsAtPath(profilesPath))) {
		return createEmptyProfiles();
	}

	try {
		const raw = await fs.readFile(profilesPath, "utf-8");
		if (!raw.trim()) {
			return createEmptyProfiles();
		}
		const parsed = JSON.parse(raw) as BmsAutosarCompileProfilesData;
		return {
			version: parsed.version || "1.0.0",
			lastSelectedId: parsed.lastSelectedId || BUILTIN_COMPILE_PROFILES[0].id,
			profiles: Array.isArray(parsed.profiles) ? parsed.profiles : [],
		};
	} catch {
		return createEmptyProfiles();
	}
}

async function writeBmsCompileProfiles(
	cwd: string,
	scope: BmsAutosarCompileProfileScope,
	data: BmsAutosarCompileProfilesData,
): Promise<string> {
	const profilesDir = getBmsCompileProfilesDir(cwd, scope);
	const profilesPath = path.join(profilesDir, PROFILES_FILE_NAME);
	await fs.mkdir(profilesDir, { recursive: true });

	const tempPath = `${profilesPath}.tmp`;
	await fs.writeFile(tempPath, JSON.stringify(data, null, 2), "utf-8");
	await fs.rename(tempPath, profilesPath);
	return profilesPath;
}

export async function saveBmsCompileProfile(
	cwd: string,
	scope: BmsAutosarCompileProfileScope,
	profile: BmsAutosarCompileProfile,
): Promise<string> {
	const data = await loadBmsCompileProfiles(cwd, scope);
	const isBuiltin = BUILTIN_COMPILE_PROFILES.some((p) => p.id === profile.id);
	if (isBuiltin) {
		throw new Error(`Profile id "${profile.id}" conflicts with a built-in profile.`);
	}

	const index = data.profiles.findIndex((p) => p.id === profile.id);
	if (index >= 0) {
		data.profiles[index] = profile;
	} else {
		data.profiles.push(profile);
	}

	await writeBmsCompileProfiles(cwd, scope, data);
	return profile.id;
}

export async function deleteBmsCompileProfile(
	cwd: string,
	scope: BmsAutosarCompileProfileScope,
	id: string,
): Promise<boolean> {
	const isBuiltin = BUILTIN_COMPILE_PROFILES.some((p) => p.id === id);
	if (isBuiltin) {
		return false;
	}

	const data = await loadBmsCompileProfiles(cwd, scope);
	const index = data.profiles.findIndex((p) => p.id === id);
	if (index < 0) {
		return false;
	}

	data.profiles.splice(index, 1);
	if (data.lastSelectedId === id) {
		data.lastSelectedId = BUILTIN_COMPILE_PROFILES[0].id;
	}
	await writeBmsCompileProfiles(cwd, scope, data);
	return true;
}

export async function setLastSelectedCompileProfile(
	cwd: string,
	scope: BmsAutosarCompileProfileScope,
	id: string,
): Promise<void> {
	const data = await loadBmsCompileProfiles(cwd, scope);
	data.lastSelectedId = id;
	await writeBmsCompileProfiles(cwd, scope, data);
}

export async function getMergedBmsCompileProfiles(
	cwd: string,
	requestedScope: BmsAutosarCompileProfileScope | "" = "",
): Promise<{
	profiles: MergedBmsAutosarCompileProfile[];
	lastSelectedId: string;
}> {
	const scopes: BmsAutosarCompileProfileScope[] =
		requestedScope === "global" ? ["global"] : requestedScope === "workspace" ? ["workspace"] : ["workspace", "global"];

	const profilesById = new Map<string, MergedBmsAutosarCompileProfile>();
	for (const builtin of BUILTIN_COMPILE_PROFILES) {
		profilesById.set(builtin.id, { ...builtin, isBuiltin: true, scope: "" });
	}

	let lastSelectedId = "";
	for (const scope of scopes) {
		const data = await loadBmsCompileProfiles(cwd, scope);
		if (lastSelectedId === "") {
			lastSelectedId = data.lastSelectedId;
		}
		for (const profile of data.profiles) {
			profilesById.set(profile.id, { ...profile, isBuiltin: false, scope });
		}
	}

	const profiles = Array.from(profilesById.values()).sort((a, b) => a.name.localeCompare(b.name));
	if (!lastSelectedId && profiles.length > 0) {
		lastSelectedId = profiles[0].id;
	}

	return { profiles, lastSelectedId };
}

export function findBmsCompileProfile(
	profiles: MergedBmsAutosarCompileProfile[],
	id: string,
): MergedBmsAutosarCompileProfile | undefined {
	return profiles.find((p) => p.id === id);
}

export function buildBmsCompileCommand(
	workspaceRoot: string,
	profile: BmsAutosarCompileProfile,
): string {
	if (profile.command) {
		return `cd "${path.join(workspaceRoot, profile.workingDirRelative || "")}" && ${profile.command}`;
	}

	const workingDir = path.join(workspaceRoot, profile.workingDirRelative || "");
	const jobs = profile.jobs ?? 32;

	if (profile.workflow === "appl") {
		return `cd "${workingDir}" && m -j${jobs}`;
	}

	return `cd "${workspaceRoot}" && launch.bat && make -j${jobs}`;
}
