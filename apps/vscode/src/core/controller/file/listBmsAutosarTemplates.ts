import type { Controller } from "..";
import {
	loadBmsTemplates,
	type BmsAutosarTemplateScope,
} from "@core/task/tools/handlers/bms-autosar/BmsAutosarTemplateStorage";
import {
	BmsAutosarTemplatesList,
	ListBmsAutosarTemplatesRequest,
} from "@shared/proto/cline/file";
import { getCwd, getDesktopDir } from "@utils/path";

/**
 * Lists user-defined BMS AUTOSAR generation templates for the workspace and
 * global scopes.
 */
export async function listBmsAutosarTemplates(
	_controller: Controller,
	request: ListBmsAutosarTemplatesRequest,
): Promise<BmsAutosarTemplatesList> {
	const cwd = await getCwd(getDesktopDir());
	const requestedScope = (request.scope as BmsAutosarTemplateScope | "") || "";

	const entries: {
		key: string;
		componentType: string;
		scope: BmsAutosarTemplateScope;
	}[] = [];
	const seenKeys = new Set<string>();

	const scopes: BmsAutosarTemplateScope[] =
		requestedScope === "global"
			? ["global"]
			: requestedScope === "workspace"
				? ["workspace"]
				: ["workspace", "global"];

	for (const scope of scopes) {
		const data = await loadBmsTemplates(cwd, scope);
		for (const [key, template] of Object.entries(data.templates)) {
			if (seenKeys.has(key)) {
				continue;
			}
			seenKeys.add(key);
			entries.push({
				key,
				componentType: template.component_type,
				scope,
			});
		}
	}

	return BmsAutosarTemplatesList.create({
		entries: entries.map((entry) => ({
			key: entry.key,
			componentType: entry.componentType,
			isBuiltin: false,
			scope: entry.scope,
		})),
	});
}
