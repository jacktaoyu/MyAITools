import { strict as assert } from "node:assert"
import { afterEach, describe, it } from "mocha"
import sinon from "sinon"
import { ClineDefaultTool } from "@/shared/tools"
import { TaskState } from "../../../TaskState"
import type { TaskConfig } from "../../types/TaskConfig"
import {
	renderTemplate,
	type BmsAutosarTemplateContext,
} from "../bms-autosar/BmsAutosarTemplateRenderer"
import { BmsAutosarGenerateHandler } from "../BmsAutosarGenerateHandler"

function createConfig() {
	const taskState = new TaskState()

	const callbacks = {
		say: sinon.stub().resolves(undefined),
		ask: sinon.stub().resolves({ response: "yesButtonClicked" }),
		saveCheckpoint: sinon.stub().resolves(),
		sayAndCreateMissingParamError: sinon.stub().resolves("missing"),
		removeLastPartialMessageIfExistsWithType: sinon.stub().resolves(),
		executeCommandTool: sinon.stub().resolves([false, "ok"]),
		cancelRunningCommandTool: sinon.stub().resolves(false),
		doesLatestTaskCompletionHaveNewChanges: sinon.stub().resolves(false),
		updateFCListFromToolResponse: sinon.stub().resolves(),
		shouldAutoApproveTool: sinon.stub().returns([false, false]),
		shouldAutoApproveToolWithPath: sinon.stub().resolves(false),
		postStateToWebview: sinon.stub().resolves(),
		reinitExistingTaskFromId: sinon.stub().resolves(),
		cancelTask: sinon.stub().resolves(),
		updateTaskHistory: sinon.stub().resolves([]),
		applyLatestBrowserSettings: sinon.stub().resolves(undefined),
		switchToActMode: sinon.stub().resolves(false),
		setActiveHookExecution: sinon.stub().resolves(),
		clearActiveHookExecution: sinon.stub().resolves(),
		getActiveHookExecution: sinon.stub().resolves(undefined),
		runUserPromptSubmitHook: sinon.stub().resolves({}),
	}

	const config = {
		taskId: "task-1",
		ulid: "ulid-1",
		cwd: "/tmp",
		mode: "act",
		strictPlanModeEnabled: false,
		yoloModeToggled: false,
		vscodeTerminalExecutionMode: "backgroundExec",
		enableParallelToolCalling: true,
		context: {},
		taskState,
		messageState: {},
		api: {
			getModel: () => ({ id: "openai/gpt-5", info: {} }),
		},
		autoApprovalSettings: {
			enableNotifications: false,
			actions: {
				executeSafeCommands: false,
				executeAllCommands: false,
			},
		},
		autoApprover: {
			shouldAutoApproveTool: sinon.stub().returns([false, false]),
		},
		browserSettings: {},
		focusChainSettings: {},
		services: {
			stateManager: {
				getGlobalStateKey: () => undefined,
				getGlobalSettingsKey: (key: string) => (key === "mode" ? "act" : undefined),
				getApiConfiguration: () => ({
					planModeApiProvider: "openai",
					actModeApiProvider: "openai",
				}),
			},
			mcpHub: {},
		},
		callbacks,
		coordinator: {
			getHandler: sinon.stub(),
		},
	} as unknown as TaskConfig

	return { config, callbacks, taskState }
}

describe("BmsAutosarTemplateRenderer", () => {
	const baseContext: BmsAutosarTemplateContext = {
		ComponentName: "BmsStateEstimator",
		COMPONENT_NAME: "BMS_STATE_ESTIMATOR",
		component_name: "BmsStateEstimator",
		WorkspaceName: "test-workspace",
		ports: [],
		runnables: [],
	}

	it("substitutes simple variables", () => {
		const result = renderTemplate("${ComponentName} / ${COMPONENT_NAME} / ${WorkspaceName}", baseContext)
		assert.equal(result, "BmsStateEstimator / BMS_STATE_ESTIMATOR / test-workspace")
	})

	it("leaves unknown variables unchanged", () => {
		const result = renderTemplate("${UnknownVar}", baseContext)
		assert.equal(result, "${UnknownVar}")
	})

	it("loops over ports and exposes item properties", () => {
		const context: BmsAutosarTemplateContext = {
			...baseContext,
			ports: [
				{ name: "CellVoltage", interface_type: "S/R", direction: "required", data_type: "Adc_VoltageType" },
				{ name: "StateOfCharge", interface_type: "S/R", direction: "provided", data_type: "Percent_Type" },
			],
		}
		const result = renderTemplate("{{#each ports}}${name}:${direction} {{/each}}", context)
		assert.equal(result, "CellVoltage:required StateOfCharge:provided ")
	})

	it("loops over runnables and exposes index", () => {
		const context: BmsAutosarTemplateContext = {
			...baseContext,
			runnables: [
				{ name: "Run10ms", event: "TimingEvent", period_ms: 10 },
				{ name: "Run100ms", event: "TimingEvent", period_ms: 100 },
			],
		}
		const result = renderTemplate("{{#each runnables}}${$index}:${name} {{/each}}", context)
		assert.equal(result, "0:Run10ms 1:Run100ms ")
	})

	it("renders conditionals based on array presence", () => {
		const withPorts = renderTemplate("{{#if ports}}has ports{{/if}}{{#unless ports}}no ports{{/unless}}", baseContext)
		assert.equal(withPorts, "no ports")

		const without = renderTemplate(
			"{{#if ports}}has ports{{/if}}{{#unless ports}}no ports{{/unless}}",
			{ ...baseContext, ports: [{ name: "P1", interface_type: "S/R", direction: "required", data_type: "uint8" }] },
		)
		assert.equal(without, "has ports")
	})

	it("supports enriched boolean flags in loops", () => {
		const context: BmsAutosarTemplateContext = {
			...baseContext,
			ports: [
				{
					name: "CellVoltage",
					interface_type: "S/R",
					direction: "required",
					data_type: "Adc_VoltageType",
					direction_required: true,
					direction_provided: false,
					interface_sr: true,
					interface_cs: false,
				},
			],
		}
		const result = renderTemplate("{{#each ports}}{{#if direction_required}}R{{/if}}{{#if direction_provided}}P{{/if}}{{#if interface_sr}}SR{{/if}}{{/each}}", context)
		assert.equal(result, "RSR")
	})

	it("supports nested loops", () => {
		const context: BmsAutosarTemplateContext = {
			...baseContext,
			ports: [
				{ name: "CellVoltage", interface_type: "S/R", direction: "required", data_type: "Adc_VoltageType" },
			],
			runnables: [
				{ name: "Run10ms", event: "TimingEvent", period_ms: 10 },
			],
		}
		const template = "{{#each runnables}}${name}:[{{#each ports}}${name}{{/each}}]{{/each}}"
		const result = renderTemplate(template, context)
		assert.equal(result, "Run10ms:[CellVoltage]")
	})
})

describe("BmsAutosarGenerateHandler", () => {
	afterEach(() => {
		sinon.restore()
	})

	it("returns a blueprint for a valid SWC request", async () => {
		const { config } = createConfig()
		const handler = new BmsAutosarGenerateHandler()

		const result = await handler.execute(config, {
			type: "tool_use",
			name: ClineDefaultTool.BMS_AUTOSAR_GENERATE,
			params: {
				component_type: "swc",
				component_name: "BmsCellMonitor",
				ports: JSON.stringify([{ name: "CellVoltage", interface_type: "S/R", direction: "required", data_type: "Adc_VoltageType" }]),
				runnables: JSON.stringify([{ name: "Run10ms", event: "TimingEvent", period_ms: 10 }]),
			},
			partial: false,
		})

		assert.equal(typeof result, "string")
		const blueprint = result as string
		assert.ok(blueprint.includes("BmsCellMonitor"))
		assert.ok(blueprint.includes("CellVoltage"))
		assert.ok(blueprint.includes("Run10ms"))
		assert.ok(blueprint.includes("APPLICATION-SW-COMPONENT-TYPE"))
		assert.ok(blueprint.includes("R-PORT-PROTOTYPE"))
	})

	it("includes BSW configuration files for bsw_module", async () => {
		const { config } = createConfig()
		const handler = new BmsAutosarGenerateHandler()

		const result = await handler.execute(config, {
			type: "tool_use",
			name: ClineDefaultTool.BMS_AUTOSAR_GENERATE,
			params: {
				component_type: "bsw_module",
				component_name: "BmsDiagnostic",
			},
			partial: false,
		})

		const blueprint = result as string
		assert.ok(blueprint.includes("BmsDiagnostic_Cfg.h"))
		assert.ok(blueprint.includes("BmsDiagnostic_Lcfg.c"))
		assert.ok(blueprint.includes("BmsDiagnostic_PBcfg.c"))
		assert.ok(blueprint.includes("BSW Configuration Files"))
		assert.ok(blueprint.includes("BSW-MODULE-DESCRIPTION"))
	})

	it("returns an error for invalid component_type", async () => {
		const { config, taskState } = createConfig()
		const handler = new BmsAutosarGenerateHandler()

		const result = await handler.execute(config, {
			type: "tool_use",
			name: ClineDefaultTool.BMS_AUTOSAR_GENERATE,
			params: {
				component_type: "invalid_type",
				component_name: "BmsFoo",
			},
			partial: false,
		})

		assert.ok((result as string).includes("Invalid component_type"))
		assert.equal(taskState.consecutiveMistakeCount, 1)
	})

	it("returns a missing parameter error when component_name is absent", async () => {
		const { config, callbacks, taskState } = createConfig()
		const handler = new BmsAutosarGenerateHandler()

		await handler.execute(config, {
			type: "tool_use",
			name: ClineDefaultTool.BMS_AUTOSAR_GENERATE,
			params: {
				component_type: "swc",
			},
			partial: false,
		})

		assert.ok(callbacks.sayAndCreateMissingParamError.calledOnce)
		assert.equal(taskState.consecutiveMistakeCount, 1)
	})

	it("infers ports and runnables from requirements when not provided", async () => {
		const { config } = createConfig()
		const handler = new BmsAutosarGenerateHandler()

		const result = await handler.execute(config, {
			type: "tool_use",
			name: ClineDefaultTool.BMS_AUTOSAR_GENERATE,
			params: {
				component_type: "swc",
				component_name: "BmsEstimator",
				requirements: "Estimate SOC every 100ms using cell voltage and temperature.",
			},
			partial: false,
		})

		const blueprint = result as string
		assert.ok(blueprint.includes("CellVoltage"))
		assert.ok(blueprint.includes("CellTemperature"))
		assert.ok(blueprint.includes("StateOfCharge"))
		assert.ok(blueprint.includes("Run100ms"))
	})

	it("generates a service component blueprint", async () => {
		const { config } = createConfig()
		const handler = new BmsAutosarGenerateHandler()

		const result = await handler.execute(config, {
			type: "tool_use",
			name: ClineDefaultTool.BMS_AUTOSAR_GENERATE,
			params: {
				component_type: "service",
				component_name: "BmsDiagnosticService",
			},
			partial: false,
		})

		const blueprint = result as string
		assert.ok(blueprint.includes("SERVICE-SW-COMPONENT-TYPE"))
		assert.ok(blueprint.includes("BmsDiagnosticService_ReportEvent"))
		assert.ok(blueprint.includes("DiagnosticEvent"))
	})

	it("generates an ECU extract blueprint", async () => {
		const { config } = createConfig()
		const handler = new BmsAutosarGenerateHandler()

		const result = await handler.execute(config, {
			type: "tool_use",
			name: ClineDefaultTool.BMS_AUTOSAR_GENERATE,
			params: {
				component_type: "ecu_extract",
				component_name: "BmsEcu",
				composition_name: "BmsEcuComposition",
				components: JSON.stringify([
					{ name: "BmsCellMonitor", type: "APPLICATION-SW-COMPONENT-TYPE", path: "/BmsCellMonitor/BmsCellMonitor" },
					{ name: "BmsDiagnosticService", type: "SERVICE-SW-COMPONENT-TYPE", path: "/BmsDiagnosticService/BmsDiagnosticService" },
				]),
			},
			partial: false,
		})

		const blueprint = result as string
		assert.ok(blueprint.includes("COMPOSITION-SW-COMPONENT-TYPE"))
		assert.ok(blueprint.includes("ROOT-SW-COMPOSITION-PROTOTYPE"))
		assert.ok(blueprint.includes("BmsEcuComposition"))
		assert.ok(blueprint.includes("BmsCellMonitor"))
		assert.ok(blueprint.includes("BmsDiagnosticService"))
	})

	it("generates a bms_thermal_manager blueprint with default ports and types ARXML", async () => {
		const { config } = createConfig()
		const handler = new BmsAutosarGenerateHandler()

		const result = await handler.execute(config, {
			type: "tool_use",
			name: ClineDefaultTool.BMS_AUTOSAR_GENERATE,
			params: {
				component_type: "bms_thermal_manager",
				component_name: "BmsThermalManager",
			},
			partial: false,
		})

		const blueprint = result as string
		assert.ok(blueprint.includes("BmsThermalManager"))
		assert.ok(blueprint.includes("CellTemperature"))
		assert.ok(blueprint.includes("CoolingPwm"))
		assert.ok(blueprint.includes("HeatingPwm"))
		assert.ok(blueprint.includes("ThermalRunaway"))
		assert.ok(blueprint.includes("Run100ms"))
		assert.ok(blueprint.includes("BmsThermalManager_Types.arxml"))
		assert.ok(blueprint.includes("APPLICATION-SW-COMPONENT-TYPE"))
	})

	it("generates a bms_controller blueprint with mode enum and contactor ports", async () => {
		const { config } = createConfig()
		const handler = new BmsAutosarGenerateHandler()

		const result = await handler.execute(config, {
			type: "tool_use",
			name: ClineDefaultTool.BMS_AUTOSAR_GENERATE,
			params: {
				component_type: "bms_controller",
				component_name: "BmsController",
			},
			partial: false,
		})

		const blueprint = result as string
		assert.ok(blueprint.includes("BMSCONTROLLER_MODE_INIT"))
		assert.ok(blueprint.includes("PackCurrent"))
		assert.ok(blueprint.includes("ContactorControl"))
		assert.ok(blueprint.includes("PreChargeStatus"))
		assert.ok(blueprint.includes("Run10ms"))
		assert.ok(blueprint.includes("Run100ms"))
	})

	it("generates a bms_diagnosis service blueprint with DTC stubs", async () => {
		const { config } = createConfig()
		const handler = new BmsAutosarGenerateHandler()

		const result = await handler.execute(config, {
			type: "tool_use",
			name: ClineDefaultTool.BMS_AUTOSAR_GENERATE,
			params: {
				component_type: "bms_diagnosis",
				component_name: "BmsDiagnosis",
			},
			partial: false,
		})

		const blueprint = result as string
		assert.ok(blueprint.includes("SERVICE-SW-COMPONENT-TYPE"))
		assert.ok(blueprint.includes("DiagnosticEvent"))
		assert.ok(blueprint.includes("DiagnosticRequest"))
		assert.ok(blueprint.includes("FaultStatus"))
		assert.ok(blueprint.includes("BmsDiagnosis_ReportEvent"))
		assert.ok(blueprint.includes("BmsDiagnosis_ClearDtc"))
		assert.ok(blueprint.includes("EventHandler"))
	})

	it("infers component type from requirements when component_type is omitted", async () => {
		const { config } = createConfig()
		const handler = new BmsAutosarGenerateHandler()

		const result = await handler.execute(config, {
			type: "tool_use",
			name: ClineDefaultTool.BMS_AUTOSAR_GENERATE,
			params: {
				component_name: "BmsBalancer",
				requirements: "Implement passive cell balancing every 1 second",
			},
			partial: false,
		})

		const blueprint = result as string
		assert.ok(blueprint.includes("component_type: bms_balancer"))
		assert.ok(blueprint.includes("BalanceCommand"))
		assert.ok(blueprint.includes("Run1s"))
	})

	it("generates batch blueprints from a JSON config file", async () => {
		const { config } = createConfig()
		const handler = new BmsAutosarGenerateHandler()

		const batchConfig = {
			components: [
				{ component_type: "bms_csc", component_name: "BmsCscFront" },
				{ component_type: "bms_controller", component_name: "BmsController" },
			],
		}

		const fs = await import("node:fs/promises")
		const configPath = "/tmp/bms-batch-test.json"
		await fs.writeFile(configPath, JSON.stringify(batchConfig), "utf-8")

		try {
			const result = await handler.execute(config, {
				type: "tool_use",
				name: ClineDefaultTool.BMS_AUTOSAR_GENERATE,
				params: {
					config_file: configPath,
				},
				partial: false,
			})

			const blueprint = result as string
			assert.ok(blueprint.includes("bms_autosar_batch_blueprint"))
			assert.ok(blueprint.includes("BmsCscFront"))
			assert.ok(blueprint.includes("BmsController"))
			assert.ok(blueprint.includes("CellVoltage_Slave"))
			assert.ok(blueprint.includes("ContactorControl"))
		} finally {
			await fs.unlink(configPath)
		}
	})

	it("includes ASIL level and safety guidelines when asil_level is provided", async () => {
		const { config } = createConfig()
		const handler = new BmsAutosarGenerateHandler()

		const result = await handler.execute(config, {
			type: "tool_use",
			name: ClineDefaultTool.BMS_AUTOSAR_GENERATE,
			params: {
				component_type: "bms_csc",
				component_name: "BmsCscAsilD",
				["asil_level" as string]: "ASIL_D",
			},
			partial: false,
		})

		const blueprint = result as string
		assert.ok(blueprint.includes("asil_level: ASIL_D"))
		assert.ok(blueprint.includes("ASIL Safety Context"))
		assert.ok(blueprint.includes("WdgM"))
		assert.ok(blueprint.includes("E2E"))
	})
})
