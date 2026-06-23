import type { Controller } from "..";
import {
	saveBmsCompileProfile,
	type BmsAutosarCompileProfileScope,
} from "@core/task/tools/handlers/bms-autosar/BmsAutosarCompileProfileStorage";
import { SaveBmsAutosarCompileProfileRequest } from "@shared/proto/cline/bms_autosar";
import { String } from "@shared/proto/cline/common";
import { getCwd, getDesktopDir } from "@utils/path";

export async function saveBmsAutosarCompileProfile(
	_controller: Controller,
	request: SaveBmsAutosarCompileProfileRequest,
): Promise<String> {
	const cwd = await getCwd(getDesktopDir());
	const scope = (request.scope as BmsAutosarCompileProfileScope) || "workspace";
	const profile = request.profile;

	if (!profile) {
		return String.create({ value: "Profile is required." });
	}

	const id = profile.id?.trim();
	const name = profile.name?.trim();
	const workflow = profile.workflow;

	if (!id) {
		return String.create({ value: "Profile id is required." });
	}
	if (!name) {
		return String.create({ value: "Profile name is required." });
	}
	if (workflow !== "appl" && workflow !== "launch") {
		return String.create({ value: "workflow must be 'appl' or 'launch'." });
	}

	try {
		const savedId = await saveBmsCompileProfile(cwd, scope, {
			id,
			name,
			workflow,
			command: profile.command?.trim(),
			workingDirRelative: profile.workingDirRelative?.trim() || "",
			jobs: profile.jobs || 32,
		});
		return String.create({ value: `Profile "${savedId}" saved.` });
	} catch (error: any) {
		return String.create({
			value: `Failed to save profile: ${error?.message || error}`,
		});
	}
}
