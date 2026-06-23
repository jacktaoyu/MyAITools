import type { Controller } from "..";
import {
	getMergedBmsCompileProfiles,
	type BmsAutosarCompileProfileScope,
} from "@core/task/tools/handlers/bms-autosar/BmsAutosarCompileProfileStorage";
import {
	BmsAutosarCompileProfile,
	BmsAutosarCompileProfilesList,
	ListBmsAutosarCompileProfilesRequest,
} from "@shared/proto/cline/bms_autosar";
import { getCwd, getDesktopDir } from "@utils/path";

export async function listBmsAutosarCompileProfiles(
	_controller: Controller,
	request: ListBmsAutosarCompileProfilesRequest,
): Promise<BmsAutosarCompileProfilesList> {
	const cwd = await getCwd(getDesktopDir());
	const requestedScope =
		(request.scope as BmsAutosarCompileProfileScope | "") || "";
	const { profiles, lastSelectedId } = await getMergedBmsCompileProfiles(
		cwd,
		requestedScope,
	);

	return BmsAutosarCompileProfilesList.create({
		profiles: profiles.map((p) =>
			BmsAutosarCompileProfile.create({
				id: p.id,
				name: p.name,
				workflow: p.workflow,
				command: p.command || "",
				commands: p.commands || [],
				workingDirRelative: p.workingDirRelative || "",
				jobs: p.jobs ?? 32,
				isBuiltin: p.isBuiltin,
				scope: p.scope,
			}),
		),
		lastSelectedId,
	});
}
