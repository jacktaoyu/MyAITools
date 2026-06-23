import type { Controller } from "..";
import {
	deleteBmsCompileProfile,
	type BmsAutosarCompileProfileScope,
} from "@core/task/tools/handlers/bms-autosar/BmsAutosarCompileProfileStorage";
import { DeleteBmsAutosarCompileProfileRequest } from "@shared/proto/cline/bms_autosar";
import { String } from "@shared/proto/cline/common";
import { getCwd, getDesktopDir } from "@utils/path";

export async function deleteBmsAutosarCompileProfile(
	_controller: Controller,
	request: DeleteBmsAutosarCompileProfileRequest,
): Promise<String> {
	const cwd = await getCwd(getDesktopDir());
	const scope = (request.scope as BmsAutosarCompileProfileScope) || "workspace";
	const id = request.id?.trim();

	if (!id) {
		return String.create({ value: "Profile id is required." });
	}

	try {
		const deleted = await deleteBmsCompileProfile(cwd, scope, id);
		if (!deleted) {
			return String.create({
				value: `Profile "${id}" not found or is built-in.`,
			});
		}
		return String.create({ value: `Profile "${id}" deleted.` });
	} catch (error: any) {
		return String.create({
			value: `Failed to delete profile: ${error?.message || error}`,
		});
	}
}
