import path from "node:path";
import { getClineHomePath } from "@/core/storage/disk";
import { loadBmsAutosarKnowledgeBaseWithSourcesCached } from "@core/task/tools/handlers/bms-autosar/BmsAutosarKnowledgeCache";
import type { retrieveRelevantKnowledgeResults as RetrieveRelevantKnowledgeResultsFn } from "@core/task/tools/handlers/bms-autosar/BmsAutosarSemanticRetrieval";
import {
	BmsAutosarKnowledgeIntent,
	BmsKnowledgeSearchResults,
	SearchBmsKnowledgeRequest,
} from "@shared/proto/cline/file";
import type { BmsAutosarKnowledgeIntent as BmsAutosarKnowledgeIntentType } from "@core/task/tools/handlers/bms-autosar/BmsAutosarQueryExpander";
import { getCwd, getDesktopDir } from "@utils/path";
import type { Controller } from "..";

const SNIPPET_MAX_CHARS = 280;

function truncateSnippet(content: string, maxChars: number): string {
	const trimmed = content.trim();
	if (trimmed.length <= maxChars) {
		return trimmed;
	}
	return `${trimmed.slice(0, maxChars).trimEnd()}...`;
}

/**
 * Performs a hybrid semantic + lexical search over the BMS AUTOSAR knowledge
 * base and returns ranked results with scores and source paths.
 */
export async function searchBmsKnowledge(
	controller: Controller,
	request: SearchBmsKnowledgeRequest,
): Promise<BmsKnowledgeSearchResults> {
	const cwd = await getCwd(getDesktopDir());
	const scope = request.scope === "global" ? "global" : "workspace";
	const allSources = await loadBmsAutosarKnowledgeBaseWithSourcesCached(cwd);

	const workspacePath = path.join(
		cwd,
		".cline",
		"bms-autosar",
		"knowledge.json",
	);
	const globalPath = path.join(
		getClineHomePath(),
		"bms-autosar",
		"knowledge.json",
	);

	const sources = allSources.filter((source) => {
		if (scope === "workspace") {
			return source.path === workspacePath;
		}
		return source.path === globalPath;
	});

	if (sources.length === 0) {
		return BmsKnowledgeSearchResults.create({ results: [] });
	}

	const { retrieveRelevantKnowledgeResults } = (await import(
		"@core/task/tools/handlers/bms-autosar/BmsAutosarSemanticRetrieval"
	)) as {
		retrieveRelevantKnowledgeResults: typeof RetrieveRelevantKnowledgeResultsFn;
	};

	const apiConfiguration = controller.stateManager.getApiConfiguration();
	const topK = request.topK && request.topK > 0 ? request.topK : 5;
	const hybridWeight =
		request.hybridWeight && !Number.isNaN(request.hybridWeight)
			? request.hybridWeight
			: 0.7;
	const scoreThreshold =
		request.scoreThreshold && !Number.isNaN(request.scoreThreshold)
			? request.scoreThreshold
			: 0;
	const tags = request.tags?.length ? request.tags : undefined;
	const sourceFiles = request.sourceFiles?.length
		? request.sourceFiles
		: undefined;
	const useReranker = request.useReranker ?? false;
	const intent = mapProtoIntentToTypeScript(request.intent);

	const results = await retrieveRelevantKnowledgeResults({
		sources,
		query: request.query,
		apiConfiguration,
		topK,
		hybridWeight,
		scoreThreshold,
		tags,
		sourceFiles,
		useReranker,
		intent,
	});

	return BmsKnowledgeSearchResults.create({
		results: results.map((result) => ({
			topic: result.entry.topic,
			score: result.score,
			sourcePath: result.sourcePath,
			snippet: truncateSnippet(result.entry.content, SNIPPET_MAX_CHARS),
			tags: result.entry.tags || [],
			sourceFiles: result.entry.sourceFiles || [],
			locations: (result.entry.locations || []).map((loc) => ({
				path: loc.path || "",
				page: loc.page ?? 0,
				chapter: loc.chapter || "",
			})),
		})),
	});
}

function mapProtoIntentToTypeScript(
	intent: BmsAutosarKnowledgeIntent | undefined,
): BmsAutosarKnowledgeIntentType | undefined {
	switch (intent) {
		case BmsAutosarKnowledgeIntent.COMPONENT_LOOKUP:
			return "component_lookup";
		case BmsAutosarKnowledgeIntent.SAFETY_GUIDANCE:
			return "safety_guidance";
		case BmsAutosarKnowledgeIntent.INTERFACE_SEARCH:
			return "interface_search";
		case BmsAutosarKnowledgeIntent.GENERAL:
			return "general";
		default:
			return undefined;
	}
}
