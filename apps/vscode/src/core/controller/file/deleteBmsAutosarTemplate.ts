import type { Controller } from "..";
import {
	deleteBmsTemplate,
	type BmsAutosarTemplateScope,
} from "@core/task/tools/handlers/bms-autosar/BmsAutosarTemplateStorage";
import { DeleteBmsAutosarTemplateRequest } from "@shared/proto/cline/file";
import { String } from "@shared/proto/cline/common";
import { getCwd, getDesktopDir } from "@utils/path";

/**
 * Deletes a user-defined BMS AUTOSAR generation template.
 */
export async function deleteBmsAutosarTemplate(
	_controller: Controller,
	request: DeleteBmsAutosarTemplateRequest,
): Promise<String> {
	const cwd = await getCwd(getDesktopDir());
	const scope = (request.scope as BmsAutosarTemplateScope) || "workspace";
	const key = request.key?.trim();

	if (!key) {
		return String.create({ value: "Template key is required." });
	}

	try {
		const deleted = await deleteBmsTemplate(cwd, scope, key);
		if (!deleted) {
			return String.create({ value: `Template '${key}' not found.` });
		}
		return String.create({ value: `Template '${key}' deleted.` });
	} catch (error: any) {
		return String.create({
			value: `Failed to delete template: ${error?.message || error}`,
		});
	}
}
