import type { Controller } from "..";
import {
	buildBmsCompileCommand,
	buildBmsCompileCommands,
	findBmsCompileProfile,
	getMergedBmsCompileProfiles,
	setLastSelectedCompileProfile,
	type BmsAutosarCompileProfileScope,
} from "@core/task/tools/handlers/bms-autosar/BmsAutosarCompileProfileStorage";
import {
	CompileBmsAutosarRequest,
	CompileBmsAutosarResponse,
} from "@shared/proto/cline/bms_autosar";
import { ExecuteCommandInTerminalRequest } from "@shared/proto/host/workspace";
import { HostProvider } from "@/hosts/host-provider";
import { Logger } from "@/shared/services/Logger";
import { getCwd, getDesktopDir } from "@utils/path";

export async function compileBmsAutosar(
	_controller: Controller,
	request: CompileBmsAutosarRequest,
): Promise<CompileBmsAutosarResponse> {
	const workspaceRoot = await getCwd(getDesktopDir());
	if (!workspaceRoot) {
		throw new Error("No workspace is open.");
	}

	const scope = (request.scope as BmsAutosarCompileProfileScope | "") || "";
	const { profiles } = await getMergedBmsCompileProfiles(workspaceRoot, scope);
	const profile = findBmsCompileProfile(profiles, request.profileId);
	if (!profile) {
		throw new Error(`Compile profile "${request.profileId}" not found.`);
	}

	const steps = buildBmsCompileCommands(workspaceRoot, profile);
	if (steps.length === 0) {
		throw new Error(`Compile profile "${profile.id}" has no commands.`);
	}

	const command = buildBmsCompileCommand(workspaceRoot, profile);
	const cwd = steps[0].cwd;
	const scopeToUpdate: BmsAutosarCompileProfileScope =
		profile.scope === "global" ? "global" : "workspace";
	await setLastSelectedCompileProfile(
		workspaceRoot,
		scopeToUpdate,
		profile.id,
	).catch((error) => {
		Logger.warn("Failed to persist last selected compile profile:", error);
	});

	try {
		const response = await HostProvider.workspace.executeCommandInTerminal(
			ExecuteCommandInTerminalRequest.create({ command, cwd }),
		);

		if (!response.success) {
			throw new Error("Failed to start command in terminal.");
		}

		return CompileBmsAutosarResponse.create({
			success: true,
			command,
			message: `Started compile in terminal: ${command}`,
		});
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		Logger.error("BMS AUTOSAR compile failed:", error);
		return CompileBmsAutosarResponse.create({
			success: false,
			command,
			message,
		});
	}
}
