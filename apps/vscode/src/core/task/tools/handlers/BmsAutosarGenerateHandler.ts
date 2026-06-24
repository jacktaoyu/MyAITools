import fs from "node:fs/promises"
import path from "node:path"
import yaml from "js-yaml"
import type { ToolUse } from "@core/assistant-message"
import { formatResponse } from "@core/prompts/responses"
import { getWorkspaceBasename } from "@core/workspace"
import { fileExistsAtPath } from "@utils/fs"
import { createConcurrencyLimit } from "@utils/concurrency"

import { ClineDefaultTool } from "@/shared/tools"
import { telemetryService } from "@/services/telemetry"
import type { ApiConfiguration } from "@shared/api"
import type { ToolResponse } from "../../index"
import {
	renderTemplate,
	type BmsAutosarPort,
	type BmsAutosarRunnable,
	type BmsAutosarTemplate,
	type BmsAutosarTemplateContext,
	type BmsAutosarTemplates,
} from "./bms-autosar/BmsAutosarTemplateRenderer"
import { loadMergedTemplates } from "./bms-autosar/BmsAutosarTemplateStorage"
import {
	completeBmsAutosarProgress,
	emitBmsAutosarProgress,
	failBmsAutosarProgress,
} from "./bms-autosar/BmsAutosarProgressBus"
import { type BmsAutosarKnowledgeEntry } from "./bms-autosar/BmsAutosarKnowledgeTypes"
import {
	findAndLoadTemplatesCached,
	loadBmsAutosarKnowledgeBaseWithSourcesCached,
} from "./bms-autosar/BmsAutosarKnowledgeCache"
import { retrieveRelevantKnowledgeResults } from "./bms-autosar/BmsAutosarSemanticRetrieval"
import { type AsilLevel, getAsilDesignGuidelines, isAsil, normalizeAsilLevel } from "./bms-autosar/BmsAutosarAsil"
import {
	inferComponentTypeFromRequirements,
	inferPortsFromRequirements,
	inferRunnablesFromRequirements,
} from "./bms-autosar/BmsAutosarRequirementParser"
import type { IPartialBlockHandler, IToolHandler } from "../ToolExecutorCoordinator"
import type { TaskConfig } from "../types/TaskConfig"
import type { StronglyTypedUIHelpers } from "../types/UIHelpers"

interface BatchComponentConfig {
	component_type?: string
	component_name: string
	ports?: BmsAutosarPort[]
	runnables?: BmsAutosarRunnable[]
	requirements?: string
	output_format?: string
	composition_name?: string
	components?: Array<{ name: string; type: string; path: string }>
	asil_level?: string
}

interface BatchConfig {
	components: BatchComponentConfig[]
}

export class BmsAutosarGenerateHandler implements IToolHandler, IPartialBlockHandler {
	readonly name = ClineDefaultTool.BMS_AUTOSAR_GENERATE

	constructor() {}

	getDescription(block: ToolUse): string {
		return `[${block.name} for '${block.params.component_name || block.params.config_file || "unknown"}']`
	}

	async handlePartialBlock(block: ToolUse, uiHelpers: StronglyTypedUIHelpers): Promise<void> {
		const partialMessage = JSON.stringify({
			component_type: block.params.component_type,
			component_name: block.params.component_name,
			config_file: block.params.config_file,
			status: "Generating BMS AUTOSAR blueprint...",
		})
		await uiHelpers.ask("tool", partialMessage, block.partial).catch(() => {})
	}

	async execute(config: TaskConfig, block: ToolUse): Promise<ToolResponse> {
		const startTime = Date.now()
		const configFile = block.params.config_file
		const componentCount = configFile ? await this.estimateBatchComponentCount(config.cwd, configFile) : 1

		try {
			await emitBmsAutosarProgress(config.taskId, {
				stage: "preparing",
				message: "Loading templates and knowledge base...",
				percentComplete: 10,
			})
			telemetryService.captureBmsAutosarGenerateStarted(config.ulid, componentCount)
			const result = configFile
				? await this.executeBatch(config, configFile)
				: await this.executeSingle(config, block)
			const duration = Date.now() - startTime
			const isBatch = componentCount > 1
			telemetryService.captureBmsAutosarGenerateCompleted(config.ulid, duration, componentCount, isBatch)
			await completeBmsAutosarProgress(config.taskId)
			return result
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error)
			telemetryService.captureBmsAutosarGenerateFailed(config.ulid, message)
			await failBmsAutosarProgress(config.taskId, message)
			throw error
		}
	}

	private async estimateBatchComponentCount(cwd: string, configFile: string): Promise<number> {
		// The exact count is resolved during executeBatch; this is a best-effort
		// hint for telemetry before parsing the file.
		try {
			const absolutePath = path.isAbsolute(configFile) ? configFile : path.resolve(cwd, configFile)
			const content = await fs.readFile(absolutePath, "utf-8")
			const parsed =
				absolutePath.endsWith(".yaml") || absolutePath.endsWith(".yml")
					? (yaml.load(content) as BatchConfig)
					: (JSON.parse(content) as BatchConfig)
			return Array.isArray(parsed?.components) ? parsed.components.length : 1
		} catch {
			return 1
		}
	}

	private async executeBatch(config: TaskConfig, configFile: string): Promise<ToolResponse> {
		const absolutePath = path.isAbsolute(configFile) ? configFile : path.resolve(config.cwd, configFile)

		if (!(await fileExistsAtPath(absolutePath))) {
			return formatResponse.toolResult(`Error: Config file not found: ${configFile}`)
		}

		let batchConfig: BatchConfig
		try {
			const content = await fs.readFile(absolutePath, "utf-8")
			if (absolutePath.endsWith(".yaml") || absolutePath.endsWith(".yml")) {
				batchConfig = yaml.load(content) as BatchConfig
			} else {
				batchConfig = JSON.parse(content) as BatchConfig
			}
		} catch (error) {
			return formatResponse.toolResult(`Error: Failed to parse config file ${configFile}: ${error}`)
		}

		if (!batchConfig || !Array.isArray(batchConfig.components) || batchConfig.components.length === 0) {
			return formatResponse.toolResult(`Error: Config file must contain a non-empty "components" array.`)
		}

		const templates = await this.loadTemplates(config)
		const knowledgeSources = await loadBmsAutosarKnowledgeBaseWithSourcesCached(config.cwd)
		const apiConfiguration = config.services.stateManager.getApiConfiguration()

		// Validate all batch entries up front and fail fast.
		const validationErrors: string[] = []
		for (let i = 0; i < batchConfig.components.length; i++) {
			const item = batchConfig.components[i]
			if (!item.component_name) {
				validationErrors.push(`Entry ${i + 1}: missing component_name`)
			}
		}
		if (validationErrors.length > 0) {
			return formatResponse.toolResult(
				`Error: Invalid batch config:\n${validationErrors.map((e) => `- ${e}`).join("\n")}`,
			)
		}

		// Build blueprints in parallel with a bounded concurrency to avoid
		// hammering the embedding API while still utilising available capacity.
		const limit = createConcurrencyLimit(3)
		const blueprints = await Promise.all(
			batchConfig.components.map((item) =>
				limit(() =>
					this.buildBlueprintFromItem(
						config,
						item,
						item.component_type || "swc",
						templates,
						knowledgeSources,
						apiConfiguration,
					),
				),
			),
		)

		return formatResponse.toolResult(
			`<bms_autosar_batch_blueprint>\nGenerated ${blueprints.length} component blueprint(s) from ${path.basename(configFile)}.\n\n${blueprints.join("\n\n---\n\n")}\n</bms_autosar_batch_blueprint>`,
		)
	}

	private async executeSingle(config: TaskConfig, block: ToolUse): Promise<ToolResponse> {
		const componentType = block.params.component_type || inferComponentTypeFromRequirements(block.params.requirements || "")
		const componentName = block.params.component_name
		const portsRaw = block.params.ports
		const runnablesRaw = block.params.runnables
		const requirements = block.params.requirements || ""
		const outputFormat = block.params.output_format || "both"
		const compositionNameRaw = block.params.composition_name
		const componentsRaw = block.params.components
		const asilLevelRaw = (block.params as Record<string, string | undefined>)["asil_level"]

		// Validate required parameters
		if (!componentType) {
			config.taskState.consecutiveMistakeCount++
			return await config.callbacks.sayAndCreateMissingParamError(block.name, "component_type")
		}

		if (!componentName) {
			config.taskState.consecutiveMistakeCount++
			return await config.callbacks.sayAndCreateMissingParamError(block.name, "component_name")
		}

		const validTypes = [
			"swc",
			"bsw_module",
			"rte_interface",
			"arxml_descriptor",
			"service",
			"ecu_extract",
			"bms_csc",
			"bms_controller",
			"bms_balancer",
			"bms_thermal_manager",
			"bms_charger",
			"bms_diagnosis",
			"bms_state_estimator",
			"bms_power_limiter",
			"bms_insulation_monitor",
			"bms_current_sensor",
		]
		if (!validTypes.includes(componentType)) {
			config.taskState.consecutiveMistakeCount++
			return formatResponse.toolResult(
				`Error: Invalid component_type "${componentType}". Must be one of: ${validTypes.join(", ")}.`,
			)
		}

		config.taskState.consecutiveMistakeCount = 0

		const item: BatchComponentConfig = {
			component_type: componentType,
			component_name: componentName,
			requirements,
			output_format: outputFormat,
			composition_name: compositionNameRaw,
			asil_level: asilLevelRaw,
		}

		try {
			if (portsRaw) {
				item.ports = JSON.parse(portsRaw)
			}
			if (runnablesRaw) {
				item.runnables = JSON.parse(runnablesRaw)
			}
			if (componentsRaw) {
				item.components = JSON.parse(componentsRaw)
			}
		} catch (error) {
			return formatResponse.toolResult(`Error: Failed to parse ports, runnables, or components JSON: ${error}`)
		}

		const templates = await this.loadTemplates(config)
		const knowledgeSources = await loadBmsAutosarKnowledgeBaseWithSourcesCached(config.cwd)
		const apiConfiguration = config.services.stateManager.getApiConfiguration()

		const blueprint = await this.buildBlueprintFromItem(
			config,
			item,
			componentType,
			templates,
			knowledgeSources,
			apiConfiguration,
		)

		return formatResponse.toolResult(blueprint)
	}

	private async buildBlueprintFromItem(
		config: TaskConfig,
		item: BatchComponentConfig,
		componentType: string,
		templates: BmsAutosarTemplates,
		knowledgeSources: { path: string; entries: BmsAutosarKnowledgeEntry[] }[],
		apiConfiguration: ApiConfiguration,
	): Promise<string> {
		const componentName = item.component_name
		const requirements = item.requirements || ""
		const outputFormat = item.output_format || "both"
		const compositionName = item.composition_name || componentName
		const components = item.components || []
		const ports = item.ports || []
		const runnables = item.runnables || []
		const asilLevel = normalizeAsilLevel(item.asil_level)

		const template = templates.templates[componentType]

		// Infer ports/runnables from requirements when not explicitly provided
		const inferredPorts = componentType !== "ecu_extract" && ports.length === 0 ? inferPortsFromRequirements(requirements) : []
		const inferredRunnables = componentType !== "ecu_extract" && runnables.length === 0 ? inferRunnablesFromRequirements(requirements) : []

		// Fall back to sensible defaults if no ports/runnables provided
		const finalPorts = ports.length > 0 ? ports : inferredPorts.length > 0 ? inferredPorts : template?.default_ports || []
		const finalRunnables = runnables.length > 0 ? runnables : inferredRunnables.length > 0 ? inferredRunnables : template?.default_runnables || []

		return this.buildBlueprint(
			config.taskId,
			componentType,
			componentName,
			compositionName,
			components,
			finalPorts,
			finalRunnables,
			requirements,
			outputFormat,
			template,
			config.cwd,
			knowledgeSources,
			apiConfiguration,
			asilLevel,
		)
	}

	private async loadTemplates(config: TaskConfig): Promise<BmsAutosarTemplates> {
		const possiblePaths = [
			// Packaged extension layout: dist/extension.js -> ../../../assets
			path.resolve(__dirname, "..", "..", "..", "assets", "bms-autosar", "templates.json"),
			// Source/test layout: src/core/task/tools/handlers -> ../../../../../assets
			path.resolve(__dirname, "..", "..", "..", "..", "..", "assets", "bms-autosar", "templates.json"),
			path.resolve(config.cwd, "assets", "bms-autosar", "templates.json"),
		]

		// Return minimal fallback templates so the tool still works without assets
		const fallback: BmsAutosarTemplates = {
			version: "1.0.0",
			templates: {
				swc: {
					component_type: "swc",
					default_ports: [],
					default_runnables: [{ name: "Run100ms", event: "TimingEvent", period_ms: 100 }],
					header_template: "#ifndef ${COMPONENT_NAME}_H\n#define ${COMPONENT_NAME}_H\n\n#include \"Rte_${ComponentName}.h\"\n\n#endif /* ${COMPONENT_NAME}_H */",
					c_template: '#include "${ComponentName}.h"\n\nvoid ${ComponentName}_Run100ms(void)\n{\n    /* TODO: implement runnable */\n}',
					arxml_template: '<AUTOSAR>\n  <AR-PACKAGES>\n    <AR-PACKAGE>\n      <SHORT-NAME>${ComponentName}</SHORT-NAME>\n    </AR-PACKAGE>\n  </AR-PACKAGES>\n</AUTOSAR>',
				},
				bsw_module: {
					component_type: "bsw_module",
					default_ports: [],
					default_runnables: [{ name: "MainFunction", event: "TimingEvent", period_ms: 10 }],
					header_template: "#ifndef ${COMPONENT_NAME}_H\n#define ${COMPONENT_NAME}_H\n\nvoid ${ComponentName}_Init(void);\nvoid ${ComponentName}_MainFunction(void);\n\n#endif /* ${COMPONENT_NAME}_H */",
					c_template: '#include "${ComponentName}.h"\n\nvoid ${ComponentName}_Init(void)\n{\n}\n\nvoid ${ComponentName}_MainFunction(void)\n{\n}',
					arxml_template: '<AUTOSAR>\n  <AR-PACKAGES>\n    <AR-PACKAGE>\n      <SHORT-NAME>${ComponentName}</SHORT-NAME>\n    </AR-PACKAGE>\n  </AR-PACKAGES>\n</AUTOSAR>',
				},
				rte_interface: {
					component_type: "rte_interface",
					default_ports: [],
					default_runnables: [],
					header_template: "#ifndef ${COMPONENT_NAME}_INTERFACE_H\n#define ${COMPONENT_NAME}_INTERFACE_H\n\n#endif",
					c_template: "",
					arxml_template: '<AUTOSAR>\n  <AR-PACKAGES>\n    <AR-PACKAGE>\n      <SHORT-NAME>${ComponentName}</SHORT-NAME>\n    </AR-PACKAGE>\n  </AR-PACKAGES>\n</AUTOSAR>',
				},
				arxml_descriptor: {
					component_type: "arxml_descriptor",
					default_ports: [],
					default_runnables: [],
					header_template: "",
					c_template: "",
					arxml_template: '<AUTOSAR>\n  <AR-PACKAGES>\n    <AR-PACKAGE>\n      <SHORT-NAME>${ComponentName}</SHORT-NAME>\n    </AR-PACKAGE>\n  </AR-PACKAGES>\n</AUTOSAR>',
				},
			},
		}

		const builtIn = await findAndLoadTemplatesCached(possiblePaths, fallback)
		return await loadMergedTemplates(config.cwd, builtIn)
	}

	private async buildBlueprint(
		taskId: string,
		componentType: string,
		componentName: string,
		compositionName: string,
		components: Array<{ name: string; type: string; path: string }>,
		ports: BmsAutosarPort[],
		runnables: BmsAutosarRunnable[],
		requirements: string,
		outputFormat: string,
		template: BmsAutosarTemplate | undefined,
		cwd: string,
		knowledgeSources: { path: string; entries: BmsAutosarKnowledgeEntry[] }[],
		apiConfiguration: ApiConfiguration,
		asilLevel: AsilLevel,
	): Promise<string> {
		const workspaceName = getWorkspaceBasename(cwd)
		const fileBase = componentName
		const macroName = componentName.toUpperCase()

		await emitBmsAutosarProgress(taskId, {
			stage: "retrieving_knowledge",
			message: `Retrieving relevant knowledge for ${componentName}...`,
			percentComplete: 30,
		})

		// Retrieve knowledge entries most relevant to this generation request.
		// Include the ASIL level in the query and prefer safety-related tags for
		// ASIL components so retrieved knowledge contains ISO 26262 guidance.
		const query = `${componentType} ${componentName} ${asilLevel} ${requirements}`.trim()
		const retrievalTags = [componentType]
		if (isAsil(asilLevel)) {
			retrievalTags.push("safety")
		}
		const relevantResults = await retrieveRelevantKnowledgeResults({
			sources: knowledgeSources,
			query,
			apiConfiguration,
			topK: 5,
			hybridWeight: 0.7,
			scoreThreshold: 0,
			tags: retrievalTags,
		})

		const filesToGenerate: string[] = []
		if (outputFormat === "c_code" || outputFormat === "both") {
			if (
				componentType === "swc" ||
				componentType === "bsw_module" ||
				componentType === "service" ||
				componentType === "bms_csc" ||
				componentType === "bms_controller" ||
				componentType === "bms_balancer" ||
				componentType === "bms_thermal_manager" ||
				componentType === "bms_charger" ||
				componentType === "bms_diagnosis" ||
				componentType === "bms_state_estimator" ||
				componentType === "bms_power_limiter" ||
				componentType === "bms_insulation_monitor" ||
				componentType === "bms_current_sensor"
			) {
				filesToGenerate.push(`${fileBase}.h`)
				filesToGenerate.push(`${fileBase}.c`)
				if (componentType === "bsw_module") {
					filesToGenerate.push(`${fileBase}_Cfg.h`)
					filesToGenerate.push(`${fileBase}_Lcfg.c`)
					filesToGenerate.push(`${fileBase}_PBcfg.c`)
				}
			} else if (componentType === "rte_interface") {
				filesToGenerate.push(`${fileBase}_Interface.h`)
			}
		}
		if (outputFormat === "arxml" || outputFormat === "both") {
			if (componentType === "ecu_extract") {
				filesToGenerate.push(`${compositionName}.arxml`)
			} else {
				filesToGenerate.push(`${fileBase}.arxml`)
				if (
					componentType === "swc" ||
					componentType === "service" ||
					componentType === "bms_csc" ||
					componentType === "bms_controller" ||
					componentType === "bms_balancer" ||
					componentType === "bms_thermal_manager" ||
					componentType === "bms_charger" ||
					componentType === "bms_diagnosis" ||
					componentType === "bms_state_estimator" ||
					componentType === "bms_power_limiter" ||
					componentType === "bms_insulation_monitor" ||
					componentType === "bms_current_sensor"
				) {
					filesToGenerate.push(`${fileBase}_Types.arxml`)
				}
			}
		}

		const enrichedPorts = ports.map((port) => ({
			...port,
			direction_required: port.direction === "required",
			direction_provided: port.direction === "provided",
			interface_sr: port.interface_type === "S/R",
			interface_cs: port.interface_type === "C/S",
		}))

		const enrichedRunnables = runnables.map((runnable) => ({
			...runnable,
			event_TimingEvent: runnable.event === "TimingEvent",
			event_DataReceivedEvent: runnable.event === "DataReceivedEvent",
			event_OperationInvokedEvent: runnable.event === "OperationInvokedEvent",
			period_s: runnable.period_ms !== undefined ? runnable.period_ms / 1000 : undefined,
		}))

		await emitBmsAutosarProgress(taskId, {
			stage: "generating",
			message: `Building blueprint for ${componentName}...`,
			percentComplete: 70,
		})

		const context: BmsAutosarTemplateContext = {
			ComponentName: componentName,
			COMPONENT_NAME: macroName,
			component_name: componentName,
			CompositionName: compositionName,
			COMPOSITION_NAME: compositionName.toUpperCase(),
			WorkspaceName: workspaceName,
			ports: enrichedPorts,
			runnables: enrichedRunnables,
			components: components.length > 0 ? components : [],
			asilLevel,
			asil_level: asilLevel,
			asil_label: asilLevel,
			asil_QM: asilLevel === "QM",
			asil_ASIL_A: asilLevel === "ASIL_A",
			asil_ASIL_B: asilLevel === "ASIL_B",
			asil_ASIL_C: asilLevel === "ASIL_C",
			asil_ASIL_D: asilLevel === "ASIL_D",
			asil_high: asilLevel === "ASIL_C" || asilLevel === "ASIL_D",
			isHighAsil: asilLevel === "ASIL_C" || asilLevel === "ASIL_D",
			asil_any: asilLevel !== "QM",
			asil_A_or_higher: asilLevel !== "QM",
			asil_B_or_higher: asilLevel === "ASIL_B" || asilLevel === "ASIL_C" || asilLevel === "ASIL_D",
			asil_C_or_higher: asilLevel === "ASIL_C" || asilLevel === "ASIL_D",
		}

		const headerTemplate = template?.header_template || ""
		const cTemplate = template?.c_template || ""
		const arxmlTemplate = template?.arxml_template || ""

		const headerExample = componentType !== "ecu_extract" ? renderTemplate(headerTemplate, context) : ""
		const cExample = componentType !== "ecu_extract" ? renderTemplate(cTemplate, context) : ""
		const arxmlExample = renderTemplate(arxmlTemplate, context)

		const bswConfigSection =
			componentType === "bsw_module"
				? `
## BSW Configuration Files
For a complete AUTOSAR BSW module, also generate the following configuration layers:
- ${fileBase}_Cfg.h   — pre-compile configuration parameters (e.g., feature enables, constant module IDs)
- ${fileBase}_Lcfg.c  — link-time configuration (e.g., default calibration values, ROM tables)
- ${fileBase}_PBcfg.c — post-build configuration (e.g., ECU-specific parameter sets)

Follow the pattern in the starter C file: include these headers, keep configuration data separate from the implementation, and use #error for missing mandatory parameters.`
				: ""

		return `<bms_autosar_blueprint>
You are generating an AUTOSAR Classic Platform artifact for a Battery Management System (BMS).

## Input
- component_type: ${componentType}
- component_name: ${componentName}
- output_format: ${outputFormat}
- asil_level: ${asilLevel}
- ports: ${JSON.stringify(ports, null, 2)}
- runnables: ${JSON.stringify(runnables, null, 2)}
${requirements ? `- requirements: ${requirements}` : ""}

## Files to Generate
${filesToGenerate.map((f) => `- ${f}`).join("\n")}${bswConfigSection}

## Relevant Knowledge Base Entries
${
				relevantResults.length > 0
					? relevantResults
							.map(
								(r) =>
									`### ${r.entry.topic} (score ${r.score.toFixed(3)}, source ${r.sourcePath || "unknown"})\n${r.entry.content}`,
							)
							.join("\n\n")
					: "No custom knowledge base entries matched this request. You can add relevant rules, templates, or conventions using the bms_autosar_knowledge tool."
			}

## ASIL Safety Context
- Target ASIL level: ${asilLevel}
${getAsilDesignGuidelines(asilLevel).split("\n").map((line) => `- ${line}`).join("\n")}

## Design Requirements
1. Follow the BMS AUTOSAR skill conventions (load skill "bms-autosar" if not already active).
2. Use AUTOSAR primitive/application data types (uint8, uint16, sint16, float32, Percent_Type, Adc_VoltageType, Temperature_DegCType, etc.).
3. Name RTE functions using the pattern: Rte_Read_<Port>_<Element>, Rte_Write_<Port>_<Element>, Rte_Call_<Port>_<Operation>.
4. For SWCs, include InternalBehavior with runnables mapped to TimingEvent/DataReceivedEvent as appropriate.
5. For BSW modules, provide Init and MainFunction, plus DET error reporting hooks.
6. For ARXML, use AUTOSAR 4.x schema, SHORT-NAME for every element, and valid DEST references.
7. Apply MISRA C:2012 aligned style: no dynamic allocation, single exit point, initialize locals, const-correctness.
8. Include a standard file header in each generated .c/.h file with module name, version, author, and copyright placeholder.

## Template Starters
${componentType !== "ecu_extract" ? `### Header (${fileBase}.h)
\`\`\`c
${headerExample}
\`\`\`

### Implementation (${fileBase}.c)
\`\`\`c
${cExample}
\`\`\`

` : ""}### ARXML (${componentType === "ecu_extract" ? compositionName : fileBase}.arxml)
\`\`\`xml
${arxmlExample}
\`\`\`

## Next Steps
Generate the complete artifacts above using write_to_file. Verify the ARXML references resolve and the C code compiles with an AUTOSAR toolchain. If any information is missing, ask the user before writing files.
</bms_autosar_blueprint>`
	}
}


