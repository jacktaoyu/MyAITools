import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import {
	extractTextFromFileWithLocations,
	extractTextFromFile,
} from "@/integrations/misc/extract-text";
import { String as ProtoString } from "@shared/proto/cline/common";
import { AddBmsKnowledgeRequest } from "@shared/proto/cline/file";
import { ShowMessageType } from "@/shared/proto/host/window";
import { getCwd, getDesktopDir } from "@utils/path";
import type { Controller } from "..";
import { HostProvider } from "@/hosts/host-provider";
import {
	saveBmsKnowledgeContent,
	saveBmsKnowledgeEntries,
} from "./bmsKnowledgeStorage";
import { extractDbcEntries } from "@core/task/tools/handlers/bms-autosar/BmsAutosarDbcParser";
import type { BmsAutosarKnowledgeEntry } from "@core/task/tools/handlers/bms-autosar/BmsAutosarKnowledgeTypes";

function hashBuffer(buffer: Buffer): string {
	return createHash("sha256").update(buffer).digest("hex");
}

function deriveTags(extension: string, isArxml: boolean): string[] {
	const tags = new Set<string>(["imported"]);
	if (isArxml) {
		tags.add("arxml");
		tags.add("autosar");
	}
	if (extension) {
		tags.add(extension.replace(".", ""));
	}
	return Array.from(tags);
}

/**
 * Opens a file picker to select a document or source file, prompts for a
 * knowledge topic, extracts the text, and saves it to the workspace BMS AUTOSAR
 * knowledge base.
 */
export async function addBmsKnowledge(
	_controller: Controller,
	request: AddBmsKnowledgeRequest,
): Promise<ProtoString> {
	const cwd = await getCwd(getDesktopDir());
	const scope = request.scope === "global" ? "global" : "workspace";

	const dialog = await HostProvider.window.showOpenDialogue({
		canSelectMany: false,
		openLabel: "Add to BMS Knowledge",
		filters: {
			files: [
				"xlsx",
				"xls",
				"docx",
				"pdf",
				"csv",
				"txt",
				"md",
				"arxml",
				"dbc",
				"c",
				"h",
				"cpp",
				"hpp",
				"cc",
				"hh",
				"json",
				"yaml",
				"yml",
				"xml",
				"py",
				"js",
				"ts",
			],
		},
	});

	const filePath = dialog.paths[0];
	if (!filePath) {
		return ProtoString.create({ value: "" });
	}

	const extension = path.extname(filePath).toLowerCase();
	const isArxml = extension === ".arxml";
	const isDbc = extension === ".dbc";
	const fileName = path.basename(filePath, extension);

	const defaultTopic = isArxml
		? (await extractShortNameFromFile(filePath)) || fileName
		: fileName;

	const topicResp = await HostProvider.window.showInputBox({
		title: "BMS AUTOSAR Knowledge Topic",
		prompt: "Enter a short topic/name for this knowledge entry",
		value: defaultTopic,
	});
	const topic = topicResp.response?.trim();
	if (!topic) {
		return ProtoString.create({ value: "No topic provided." });
	}

	const stat = await fs.stat(filePath).catch(() => undefined);
	if (!stat) {
		const message = `Failed to stat ${path.basename(filePath)}.`;
		HostProvider.window.showMessage({ type: ShowMessageType.ERROR, message });
		return ProtoString.create({ value: message });
	}

	try {
		const buffer = await fs.readFile(filePath);
		const sourceHash = hashBuffer(buffer);
		const now = new Date().toISOString();

		if (isDbc) {
			const dbcContent = buffer.toString("utf-8");
			const dbcEntries = extractDbcEntries(dbcContent);
			if (dbcEntries.length === 0) {
				const message = `No DBC messages found in ${path.basename(filePath)}.`;
				HostProvider.window.showMessage({
					type: ShowMessageType.WARNING,
					message,
				});
				return ProtoString.create({ value: message });
			}
			const entries: BmsAutosarKnowledgeEntry[] = dbcEntries.map(
				({ topic: messageName, text }) => ({
					topic: `${topic}/${messageName}`,
					content: text,
					createdAt: now,
					updatedAt: now,
					tags: deriveTags(extension, false),
					sourceFiles: [filePath],
					sourcePath: filePath,
					sourceHash,
					sourceMtimeMs: stat.mtimeMs,
					sourceSize: stat.size,
					locations: [],
				}),
			);
			const { kbPath } = await saveBmsKnowledgeEntries({ cwd, scope, entries });
			const message = `Added ${entries.length} DBC message entries from ${path.basename(filePath)} to ${scope} BMS AUTOSAR knowledge base (${kbPath}).`;
			HostProvider.window.showMessage({
				type: ShowMessageType.INFORMATION,
				message,
			});
			return ProtoString.create({ value: message });
		}

		const { text, locations } =
			await extractTextFromFileWithLocations(filePath);
		const { chunkCount } = await saveBmsKnowledgeContent({
			cwd,
			scope,
			topic,
			content: text,
			tags: deriveTags(extension, isArxml),
			sourceFiles: [filePath],
			sourcePath: filePath,
			sourceHash,
			sourceMtimeMs: stat.mtimeMs,
			sourceSize: stat.size,
			locations,
		});

		const message =
			chunkCount > 0
				? `Added "${topic}" as ${chunkCount} chunks from ${path.basename(filePath)} to ${scope} BMS AUTOSAR knowledge base.`
				: `Added "${topic}" from ${path.basename(filePath)} to ${scope} BMS AUTOSAR knowledge base.`;
		HostProvider.window.showMessage({
			type: ShowMessageType.INFORMATION,
			message,
		});
		return ProtoString.create({ value: message });
	} catch (error) {
		const message = `Failed to extract text from ${path.basename(filePath)}: ${error instanceof Error ? error.message : String(error)}`;
		HostProvider.window.showMessage({ type: ShowMessageType.ERROR, message });
		return ProtoString.create({ value: message });
	}
}

async function extractShortNameFromFile(
	filePath: string,
): Promise<string | undefined> {
	try {
		const content = await extractTextFromFile(filePath);
		return extractShortName(content);
	} catch {
		return undefined;
	}
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
