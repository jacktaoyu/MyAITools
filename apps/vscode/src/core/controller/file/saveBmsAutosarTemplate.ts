import type { Controller } from "..";
import {
	saveBmsTemplate,
	type BmsAutosarTemplateScope,
} from "@core/task/tools/handlers/bms-autosar/BmsAutosarTemplateStorage";
import { SaveBmsAutosarTemplateRequest } from "@shared/proto/cline/file";
import { String } from "@shared/proto/cline/common";
import { getCwd, getDesktopDir } from "@utils/path";

/**
 * Saves a user-defined BMS AUTOSAR generation template.
 */
export async function saveBmsAutosarTemplate(
	_controller: Controller,
	request: SaveBmsAutosarTemplateRequest,
): Promise<String> {
	const cwd = await getCwd(getDesktopDir());
	const scope = (request.scope as BmsAutosarTemplateScope) || "workspace";
	const key = request.key?.trim();

	if (!key) {
		return String.create({ value: "Template key is required." });
	}

	if (!request.componentType) {
		return String.create({ value: "component_type is required." });
	}

	try {
		const kbPath = await saveBmsTemplate(cwd, scope, key, {
			component_type: request.componentType,
			default_ports: [],
			default_runnables: [],
			header_template: request.headerTemplate,
			c_template: request.cTemplate,
			arxml_template: request.arxmlTemplate,
		});
		return String.create({ value: `Template saved to ${kbPath}.` });
	} catch (error: any) {
		return String.create({
			value: `Failed to save template: ${error?.message || error}`,
		});
	}
}
