import {
	ExecuteCommandInTerminalRequest,
	ExecuteCommandInTerminalResponse,
} from "@shared/proto/host/workspace";
import { VscodeTerminalManager } from "@/hosts/vscode/terminal/VscodeTerminalManager";
import { Logger } from "@/shared/services/Logger";

const terminalManager = new VscodeTerminalManager();

/**
 * Executes a command in a pooled integrated terminal and waits for it to complete.
 * @param request The request containing the command and optional cwd.
 * @returns Response indicating whether the command completed successfully.
 */
export async function executeCommandInTerminal(
	request: ExecuteCommandInTerminalRequest,
): Promise<ExecuteCommandInTerminalResponse> {
	try {
		const terminalInfo = await terminalManager.getOrCreateTerminal(
			request.cwd || "",
		);
		const process = terminalManager.runCommand(terminalInfo, request.command);

		let exitCode: number | undefined;
		process.once("completed", (details) => {
			exitCode = details?.exitCode ?? undefined;
		});

		await process;

		// Without shell integration we cannot determine the real exit code, so we
		// treat completion as success to preserve the previous fire-and-forget behavior.
		const success = exitCode === undefined || exitCode === 0;
		return ExecuteCommandInTerminalResponse.create({ success });
	} catch (error) {
		Logger.error("Error executing command in terminal:", error);
		return ExecuteCommandInTerminalResponse.create({
			success: false,
		});
	}
}
