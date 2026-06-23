import type { Controller } from "..";
import {
	BUILTIN_COMPILE_PROFILES,
	saveBmsCompileBuiltinOverride,
	saveBmsCompileProfile,
	type BmsAutosarCompileProfileScope,
} from "@core/task/tools/handlers/bms-autosar/BmsAutosarCompileProfileStorage";
import { SaveBmsAutosarCompileProfileRequest } from "@shared/proto/cline/bms_autosar";
import { String as StringMessage } from "@shared/proto/cline/common";
import { getCwd, getDesktopDir } from "@utils/path";

export async function saveBmsAutosarCompileProfile(
	_controller: Controller,
	request: SaveBmsAutosarCompileProfileRequest,
): Promise<StringMessage> {
	const cwd = await getCwd(getDesktopDir());
	const scope = (request.scope as BmsAutosarCompileProfileScope) || "workspace";
	const profile = request.profile;

	if (!profile) {
		return StringMessage.create({ value: "Profile is required." });
	}

	const id = profile.id?.trim();
	const name = profile.name?.trim();
	const workflow = profile.workflow;

	if (!id) {
		return StringMessage.create({ value: "Profile id is required." });
	}
	if (!name) {
		return StringMessage.create({ value: "Profile name is required." });
	}
	if (workflow !== "appl" && workflow !== "launch") {
		return StringMessage.create({
			value: "workflow must be 'appl' or 'launch'.",
		});
	}

	const isBuiltin = BUILTIN_COMPILE_PROFILES.some((p) => p.id === id);
	const commands = profile.commands
		?.map((c) => c.trim())
		.filter((c) => c.length > 0);

	try {
		if (isBuiltin) {
			const savedId = await saveBmsCompileBuiltinOverride(cwd, scope, id, {
				command: profile.command?.trim() || undefined,
				commands: commands && commands.length > 0 ? commands : undefined,
				workingDirRelative: profile.workingDirRelative?.trim() || undefined,
				jobs: profile.jobs || undefined,
			});
			return StringMessage.create({
				value: `Built-in profile "${savedId}" updated.`,
			});
		}

		const savedId = await saveBmsCompileProfile(cwd, scope, {
			id,
			name,
			workflow,
			command: profile.command?.trim() || undefined,
			commands: commands && commands.length > 0 ? commands : undefined,
			workingDirRelative: profile.workingDirRelative?.trim() || "",
			jobs: profile.jobs || 32,
		});
		return StringMessage.create({ value: `Profile "${savedId}" saved.` });
	} catch (error: unknown) {
		const message = error instanceof Error ? error.message : String(error);
		return StringMessage.create({
			value: `Failed to save profile: ${message}`,
		});
	}
}
