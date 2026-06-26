import { ModelFamily } from "@/shared/prompts"
import { ClineDefaultTool } from "@/shared/tools"
import type { ClineToolSpec } from "../spec"

const id = ClineDefaultTool.BMS_AUTOSAR_KNOWLEDGE

const generic: ClineToolSpec = {
	variant: ModelFamily.GENERIC,
	id,
	name: "bms_autosar_knowledge",
	description: `Manage the user-extensible BMS AUTOSAR knowledge base. Use this tool to add, list, retrieve, or delete project-specific rules, templates, naming conventions, ARXML patterns, and other BMS AUTOSAR guidance. Entries added here are automatically referenced by the bms_autosar_generate tool when generating code.`,
	contextRequirements: (context) => context.bmsAutosarEnabled === true,
	parameters: [
		{
			name: "action",
			required: true,
			instruction: `The operation to perform. Must be one of: "add" (create a new knowledge entry), "list" (show all entry topics), "get" (retrieve a specific entry by topic), "delete" (remove a specific entry by topic).`,
			usage: "add",
		},
		{
			name: "topic",
			required: false,
			instruction: `The topic or keyword of the knowledge entry. Required for "add", "get", and "delete". Use a short, descriptive name (e.g., "NXP S32K BMS pin mapping", "Project naming convention").`,
			usage: "Project naming convention",
		},
		{
			name: "content",
			required: false,
			instruction: `The knowledge content to store. For "add", either "content" or "file_path" must be provided (both can be provided and will be merged). Can include rules, code snippets, ARXML fragments, tables, or any guidance relevant to BMS AUTOSAR generation.`,
			usage: "All BMS SWC files must use the Bms_ prefix and be placed under /Application/SWCs.",
		},
		{
			name: "file_path",
			required: false,
			instruction: `For "add" only. Path to a file from which to extract text and store as knowledge. Supported formats include .xlsx, .docx, .pdf, .csv, .txt, .md, .ipynb, and .arxml. ARXML files are tagged as ["arxml", "autosar"] and the first <SHORT-NAME> is suggested as the topic. The file must be located inside the current workspace (or in the global knowledge directory ~/.cline/bms-autosar/ when scope is "global"). Cannot be used together with folder_path.`,
			usage: "docs/bms_requirements.xlsx",
		},
		{
			name: "folder_path",
			required: false,
			instruction: `For "add" only. Path to a folder from which to recursively extract text from all supported files and store as knowledge. Supported formats include .xlsx, .docx, .pdf, .csv, .txt, .md, .ipynb, and .arxml. The folder must be located inside the current workspace (or in the global knowledge directory ~/.cline/bms-autosar/ when scope is "global"). Cannot be used together with file_path.`,
			usage: "docs/bms_knowledge",
		},
		{
			name: "tags",
			required: false,
			instruction: `For "add" only. Optional JSON array of tag strings to categorize the entry (e.g., ["arxml", "naming", "requirements"]). Tags are shown in the knowledge manager and can be used to filter entries.`,
			usage: '["arxml", "requirements"]',
		},
		{
			name: "scope",
			required: false,
			instruction: `Where to store the entry: "workspace" (default, tied to the current project) or "global" (available across all projects).`,
			usage: "workspace",
		},
	],
}

export const bms_autosar_knowledge_variants = [generic]
