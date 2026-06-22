import path from "node:path";
import { extractTextFromFile } from "@/integrations/misc/extract-text";
import { String } from "@shared/proto/cline/common";
import { AddBmsKnowledgeRequest } from "@shared/proto/cline/file";
import { ShowMessageType } from "@/shared/proto/host/window";
import { getCwd, getDesktopDir } from "@utils/path";
import type { Controller } from "..";
import { HostProvider } from "@/hosts/host-provider";
import { saveBmsKnowledgeContent } from "./bmsKnowledgeStorage";

/**
 * Opens a file picker to select an Excel/Word/PDF/ARXML/etc. document, prompts for a
 * knowledge topic, extracts the text, and saves it to the workspace BMS AUTOSAR
 * knowledge base.
 */
export async function addBmsKnowledge(
	_controller: Controller,
	request: AddBmsKnowledgeRequest,
): Promise<String> {
	const cwd = await getCwd(getDesktopDir());
	const scope = request.scope === "global" ? "global" : "workspace";

	const dialog = await HostProvider.window.showOpenDialogue({
		canSelectMany: false,
		openLabel: "Add to BMS Knowledge",
		filters: {
			files: ["xlsx", "xls", "docx", "pdf", "csv", "txt", "md", "arxml"],
		},
	});

	const filePath = dialog.paths[0];
	if (!filePath) {
		return String.create({ value: "" });
	}

	let extracted: string;
	try {
		extracted = await extractTextFromFile(filePath);
	} catch (error: any) {
		const message = `Failed to extract text from ${path.basename(filePath)}: ${error?.message || error}`;
		HostProvider.window.showMessage({ type: ShowMessageType.ERROR, message });
		return String.create({ value: message });
	}

	const extension = path.extname(filePath).toLowerCase();
	const isArxml = extension === ".arxml";
	const defaultTopic = isArxml
		? extractShortName(extracted) || path.basename(filePath, extension)
		: path.basename(filePath, extension);

	const topicResp = await HostProvider.window.showInputBox({
		title: "BMS AUTOSAR Knowledge Topic",
		prompt: "Enter a short topic/name for this knowledge entry",
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
		content: extracted,
		tags: isArxml ? ["imported", "arxml", "autosar"] : ["imported"],
		sourceFiles: [filePath],
	});

	const message =
		chunkCount > 0
			? `Added "${topic}" as ${chunkCount} chunks from ${path.basename(filePath)} to ${scope} BMS AUTOSAR knowledge base.`
			: `Added "${topic}" from ${path.basename(filePath)} to ${scope} BMS AUTOSAR knowledge base.`;
	HostProvider.window.showMessage({
		type: ShowMessageType.INFORMATION,
		message,
	});

	return String.create({ value: message });
}

/**
 * Extracts the first <SHORT-NAME> value from an ARXML string.
 * Returns undefined if no SHORT-NAME is found.
 */
export function extractShortName(content: string): string | undefined {
	const match = content.match(/<SHORT-NAME>([^<]*)<\/SHORT-NAME>/);
	const candidate = match?.[1]?.trim();
	return candidate || undefined;
}
