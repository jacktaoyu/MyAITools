import { ModelFamily } from "@/shared/prompts"
import { ClineDefaultTool } from "@/shared/tools"
import type { ClineToolSpec } from "../spec"

const id = ClineDefaultTool.BMS_AUTOSAR_GENERATE

const generic: ClineToolSpec = {
	variant: ModelFamily.GENERIC,
	id,
	name: "bms_autosar_generate",
	description: `Generate AUTOSAR Classic Platform software artifacts for Battery Management Systems (BMS). This tool can produce SWC implementations (.c/.h), BSW module implementations, RTE interface definitions, ARXML descriptors, and BMS-domain specialized components (controller, balancer, thermal manager, charger, CSC, diagnosis) following AUTOSAR naming conventions and MISRA C:2012 aligned coding rules.`,
	parameters: [
		{
			name: "component_type",
			required: false,
			instruction: `The type of artifact to generate. Must be one of: "swc" (Application Software Component), "bsw_module" (Basic Software module), "rte_interface" (RTE Sender/Receiver or Client/Server interface), "arxml_descriptor" (standalone ARXML descriptor), "service" (AUTOSAR Service SWC for diagnostics/calibration), "ecu_extract" (ECU-level composition ARXML), "bms_csc" (Cell Supervision Circuit / AFE slave interface), "bms_controller" (BMS mode manager, contactor/HV state machine), "bms_balancer" (passive/active cell balancing), "bms_thermal_manager" (thermal runaway protection, cooling/heating PWM), "bms_charger" (AC/DC charger interface, CC/CV control), "bms_diagnosis" (DTC manager / diagnostic service SWC). If omitted, the tool will infer a domain-specific type from the requirements text (e.g., "thermal manager" -> "bms_thermal_manager").`,
			usage: "bms_thermal_manager",
		},
		{
			name: "component_name",
			required: true,
			instruction: `The SHORT-NAME of the component. Use PascalCase and the Bms prefix where appropriate, e.g., "BmsStateEstimator", "BmsCellMonitor", "BmsThermalManager".`,
			usage: "BmsStateEstimator",
		},
		{
			name: "ports",
			required: false,
			instruction: `JSON array of port definitions. Each port is an object with: name (string), interface_type ("S/R" or "C/S"), direction ("provided" or "required"), and data_type (string). Example: [{"name":"CellVoltage","interface_type":"S/R","direction":"required","data_type":"Adc_VoltageType"}]`,
			usage: '[{"name":"CellVoltage","interface_type":"S/R","direction":"required","data_type":"Adc_VoltageType"}]',
		},
		{
			name: "runnables",
			required: false,
			instruction: `JSON array of runnable definitions. Each runnable is an object with: name (string), event ("TimingEvent" | "DataReceivedEvent" | "OperationInvokedEvent"), and period_ms (number, for TimingEvent).`,
			usage: '[{"name":"Run100ms","event":"TimingEvent","period_ms":100}]',
		},
		{
			name: "requirements",
			required: false,
			instruction: `Free-form additional requirements, constraints, or design notes to consider when generating the artifact.`,
			usage: "Estimate SOC using extended Kalman filter and support SOH tracking",
		},
		{
			name: "output_format",
			required: false,
			instruction: `Desired output format: "c_code" (only .c/.h files), "arxml" (only ARXML descriptor), or "both" (default).`,
			usage: "both",
		},
		{
			name: "composition_name",
			required: false,
			instruction: `For component_type "ecu_extract" only: the SHORT-NAME of the top-level composition. Defaults to component_name.`,
			usage: "BmsEcuComposition",
		},
		{
			name: "components",
			required: false,
			instruction: `For component_type "ecu_extract" only: JSON array of component prototypes to include in the composition. Each item has: name (string), type (AUTOSAR element type such as "APPLICATION-SW-COMPONENT-TYPE"), and path (absolute ARXML reference path).`,
			usage: '[{"name":"BmsCellMonitor","type":"APPLICATION-SW-COMPONENT-TYPE","path":"/BmsCellMonitor/BmsCellMonitor"}]',
		},
		{
			name: "config_file",
			required: false,
			instruction: `Path to a JSON or YAML batch configuration file. When provided, the tool generates blueprints for all components listed in the file instead of using the inline parameters. The file must contain a "components" array, where each entry supports component_type, component_name, ports, runnables, requirements, output_format, composition_name, and components.`,
			usage: "bms-components.json",
		},
	],
}

export const bms_autosar_generate_variants = [generic]
