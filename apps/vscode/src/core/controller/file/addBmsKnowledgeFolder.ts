import path from "node:path";
import {
	extractTextFromFolder,
	type ExtractTextFromFolderResult,
} from "@/integrations/misc/extract-text";
import { String } from "@shared/proto/cline/common";
import { AddBmsKnowledgeFolderRequest } from "@shared/proto/cline/file";
import { ShowMessageType } from "@/shared/proto/host/window";
import { getCwd, getDesktopDir } from "@utils/path";
import type { Controller } from "..";
import { HostProvider } from "@/hosts/host-provider";
import { saveBmsKnowledgeContent } from "./bmsKnowledgeStorage";

/**
 * Opens a folder picker to recursively import all supported documents from a
 * folder into the BMS AUTOSAR knowledge base.
 */
export async function addBmsKnowledgeFolder(
	_controller: Controller,
	request: AddBmsKnowledgeFolderRequest,
): Promise<String> {
	const cwd = await getCwd(getDesktopDir());
	const scope = request.scope === "global" ? "global" : "workspace";

	const dialog = await HostProvider.window.showOpenDialogue({
		canSelectMany: false,
		canSelectFolders: true,
		canSelectFiles: false,
		openLabel: "Add Folder to BMS Knowledge",
	});

	const folderPath = dialog.paths[0];
	if (!folderPath) {
		return String.create({ value: "" });
	}

	let extracted: ExtractTextFromFolderResult;
	try {
		extracted = await extractTextFromFolder(folderPath);
	} catch (error: any) {
		const message = `Failed to import folder ${path.basename(folderPath)}: ${error?.message || error}`;
		HostProvider.window.showMessage({ type: ShowMessageType.ERROR, message });
		return String.create({ value: message });
	}

	const defaultTopic = path.basename(folderPath);

	const topicResp = await HostProvider.window.showInputBox({
		title: "BMS AUTOSAR Knowledge Topic",
		prompt: "Enter a short topic/name for this folder knowledge entry",
		value: defaultTopic,
	});
	const topic = topicResp.response?.trim();
	if (!topic) {
		return String.create({ value: "No topic provided." });
	}

	const { chunkCount } = await saveBmsKnowledgeContent({
		cwd,
		scope,
		topic,
		content: extracted.text,
		tags: ["imported", "folder"],
		sourceFiles: extracted.files,
	});

	const failureSummary =
		extracted.failedFiles.length > 0
			? ` (${extracted.failedFiles.length} file(s) could not be read: ${extracted.failedFiles.map((f) => f.path).join(", ")})`
			: "";
	const message =
		chunkCount > 0
			? `Added "${topic}" as ${chunkCount} chunks from ${extracted.files.length}/${extracted.totalFiles} files in folder ${path.basename(folderPath)} to ${scope} BMS AUTOSAR knowledge base.${failureSummary}`
			: `Added "${topic}" from ${extracted.files.length}/${extracted.totalFiles} files in folder ${path.basename(folderPath)} to ${scope} BMS AUTOSAR knowledge base.${failureSummary}`;
	HostProvider.window.showMessage({
		type: ShowMessageType.INFORMATION,
		message,
	});

	return String.create({ value: message });
}
