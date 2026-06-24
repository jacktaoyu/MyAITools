import type { BmsAutosarPort, BmsAutosarRunnable } from "./BmsAutosarTemplateRenderer"

interface PortRule {
	patterns: RegExp[]
	port: BmsAutosarPort
}

interface RunnableRule {
	patterns: RegExp[]
	runnable: BmsAutosarRunnable
}

const PORT_RULES: PortRule[] = [
	{
		patterns: [/cell\s+voltage|voltage\s+measurement/i],
		port: { name: "CellVoltage", interface_type: "S/R", direction: "required", data_type: "Adc_VoltageType" },
	},
	{
		patterns: [/cell\s+temperature|\btemperature\b/i],
		port: { name: "CellTemperature", interface_type: "S/R", direction: "required", data_type: "Temperature_DegCType" },
	},
	{
		patterns: [/state\s+of\s+charge|\bsoc\b/i],
		port: { name: "StateOfCharge", interface_type: "S/R", direction: "provided", data_type: "Percent_Type" },
	},
	{
		patterns: [/state\s+of\s+health|\bsoh\b/i],
		port: { name: "StateOfHealth", interface_type: "S/R", direction: "provided", data_type: "Percent_Type" },
	},
	{
		patterns: [/diagnosis|\bdtc\b|diagnostic/i],
		port: { name: "DiagnosisRequest", interface_type: "C/S", direction: "provided", data_type: "Diag_RequestType" },
	},
	{
		patterns: [/contactor|relay/i],
		port: { name: "ContactorControl", interface_type: "S/R", direction: "provided", data_type: "uint8" },
	},
	{
		patterns: [/thermal\s+runaway|overheat/i],
		port: { name: "ThermalRunaway", interface_type: "S/R", direction: "provided", data_type: "boolean" },
	},
	{
		patterns: [/current\s+measurement|\bcurrent\b/i],
		port: { name: "PackCurrent", interface_type: "S/R", direction: "required", data_type: "sint16" },
	},
	{
		patterns: [/slave\s+voltage|csc|afe|cell\s+supervision/i],
		port: { name: "CellVoltage_Slave", interface_type: "S/R", direction: "required", data_type: "Adc_VoltageType" },
	},
	{
		patterns: [/slave\s+temperature|csc|afe|cell\s+supervision/i],
		port: { name: "CellTemperature_Slave", interface_type: "S/R", direction: "required", data_type: "Temperature_DegCType" },
	},
	{
		patterns: [/pre[-\s]?charge|precharge/i],
		port: { name: "PreChargeStatus", interface_type: "S/R", direction: "provided", data_type: "uint8" },
	},
	{
		patterns: [/hv\s+request|high\s+voltage\s+request/i],
		port: { name: "HvRequest", interface_type: "S/R", direction: "required", data_type: "boolean" },
	},
	{
		patterns: [/balance|equalization/i],
		port: { name: "BalanceCommand", interface_type: "S/R", direction: "provided", data_type: "uint16" },
	},
	{
		patterns: [/cooling\s+pwm|cooling/i],
		port: { name: "CoolingPwm", interface_type: "S/R", direction: "provided", data_type: "uint8" },
	},
	{
		patterns: [/heating\s+pwm|heating/i],
		port: { name: "HeatingPwm", interface_type: "S/R", direction: "provided", data_type: "uint8" },
	},
	{
		patterns: [/charger[\s\w]*voltage|charge[\s\w]*voltage/i],
		port: { name: "ChargerVoltage", interface_type: "S/R", direction: "required", data_type: "uint16" },
	},
	{
		patterns: [/charger[\s\w]*current|charge[\s\w]*current/i],
		port: { name: "ChargerCurrent", interface_type: "S/R", direction: "required", data_type: "sint16" },
	},
	{
		patterns: [/charge\s+request|charge\s+status/i],
		port: { name: "ChargeRequest", interface_type: "S/R", direction: "provided", data_type: "uint16" },
	},
	{
		patterns: [/fault\s+status|\bfault\b/i],
		port: { name: "FaultStatus", interface_type: "S/R", direction: "provided", data_type: "uint16" },
	},
	{
		patterns: [/state\s+of\s+power|\bsop\b|power\s+limit/i],
		port: { name: "StateOfPower", interface_type: "S/R", direction: "provided", data_type: "Power_KwType" },
	},
	{
		patterns: [/state\s+of\s+energy|\bsoe\b/i],
		port: { name: "StateOfEnergy", interface_type: "S/R", direction: "provided", data_type: "Energy_WhType" },
	},
	{
		patterns: [/charge\s+power\s+limit|\bcharge\s+limit\b/i],
		port: { name: "ChargePowerLimit", interface_type: "S/R", direction: "provided", data_type: "Power_KwType" },
	},
	{
		patterns: [/discharge\s+power\s+limit|\bdischarge\s+limit\b/i],
		port: { name: "DischargePowerLimit", interface_type: "S/R", direction: "provided", data_type: "Power_KwType" },
	},
	{
		patterns: [/insulation\s+resistance|insulation\s+monitor|isolation\s+resistance/i],
		port: { name: "InsulationResistance", interface_type: "S/R", direction: "provided", data_type: "Resistance_KohmType" },
	},
	{
		patterns: [/hv\s+bus|high\s+voltage\s+voltage/i],
		port: { name: "HvBusVoltage", interface_type: "S/R", direction: "required", data_type: "uint16" },
	},
	{
		patterns: [/insulation\s+fault/i],
		port: { name: "InsulationFault", interface_type: "S/R", direction: "provided", data_type: "boolean" },
	},
	{
		patterns: [/current\s+sensor|hall\s+sensor|shunt\s+resistor|raw\s+adc\s+current/i],
		port: { name: "RawAdcCurrent", interface_type: "S/R", direction: "required", data_type: "Adc_VoltageType" },
	},
	{
		patterns: [/current\s+sensor\s+fault|pack\s+current\s+fault/i],
		port: { name: "CurrentSensorFault", interface_type: "S/R", direction: "provided", data_type: "boolean" },
	},
]

const RUNNABLE_RULES: RunnableRule[] = [
	{
		patterns: [/every\s+10\s*ms|\b10\s*ms\b|\b10ms\b/i],
		runnable: { name: "Run10ms", event: "TimingEvent", period_ms: 10 },
	},
	{
		patterns: [/every\s+100\s*ms|\b100\s*ms\b|\b100ms\b/i],
		runnable: { name: "Run100ms", event: "TimingEvent", period_ms: 100 },
	},
	{
		patterns: [/every\s+1000\s*ms|\b1000\s*ms\b|\b1000ms\b|\b1\s*s\b/i],
		runnable: { name: "Run1s", event: "TimingEvent", period_ms: 1000 },
	},
	{
		patterns: [/on\s+data\s+received|data\s+received\s+event/i],
		runnable: { name: "DataReceivedRunnable", event: "DataReceivedEvent" },
	},
	{
		patterns: [/initialize|\binit\b/i],
		runnable: { name: "Init", event: "OperationInvokedEvent" },
	},
	{
		patterns: [/main\s+function|periodic\s+task/i],
		runnable: { name: "MainFunction", event: "TimingEvent", period_ms: 10 },
	},
]

function matchesAny(text: string, patterns: RegExp[]): boolean {
	return patterns.some((pattern) => pattern.test(text))
}

/**
 * Infers BMS AUTOSAR ports from free-form requirement text.
 *
 * The matching is intentionally conservative (keyword-based) to avoid
 * hallucinating ports. It is only used as a fallback when the caller did not
 * explicitly provide a ports list.
 */
export function inferPortsFromRequirements(requirements: string): BmsAutosarPort[] {
	const text = requirements.trim()
	if (!text) {
		return []
	}

	const seen = new Set<string>()
	const ports: BmsAutosarPort[] = []

	for (const rule of PORT_RULES) {
		if (matchesAny(text, rule.patterns) && !seen.has(rule.port.name)) {
			seen.add(rule.port.name)
			ports.push(rule.port)
		}
	}

	return ports
}

interface ComponentTypeRule {
	patterns: RegExp[]
	componentType: string
}

const COMPONENT_TYPE_RULES: ComponentTypeRule[] = [
	{ patterns: [/\bcsc\b|cell\s+supervision|afe\s+slave|slave\s+ic/i], componentType: "bms_csc" },
	{
		patterns: [/bms\s+controller|contactor\s+control|hv\s+state|pre[-\s]?charge|mode\s+manager/i],
		componentType: "bms_controller",
	},
	{ patterns: [/cell\s+balanc|equalization/i], componentType: "bms_balancer" },
	{ patterns: [/thermal\s+manager|cooling|heating|thermal\s+runaway/i], componentType: "bms_thermal_manager" },
	{ patterns: [/charger|charge\s+control|cc\/cv/i], componentType: "bms_charger" },
	{ patterns: [/diagnos|dtc|dem\s+fault|fault\s+manager/i], componentType: "bms_diagnosis" },
	{ patterns: [/state\s+(of\s+charge|of\s+health|of\s+power|of\s+energy)|\b(soc|soh|sop|soe)\b|state\s+estimat|kalman\s+filter/i], componentType: "bms_state_estimator" },
	{ patterns: [/power\s+limit|\bsop\b|charge\s+power\s+limit|discharge\s+power\s+limit|power\s+derating/i], componentType: "bms_power_limiter" },
	{ patterns: [/insulation\s+monitor|isolation\s+monitor|insulation\s+resistance|hv\s+isolation/i], componentType: "bms_insulation_monitor" },
	{ patterns: [/current\s+sensor|hall\s+sensor|shunt\s+current|pack\s+current\s+measurement/i], componentType: "bms_current_sensor" },
]

/**
 * Infers the BMS AUTOSAR component type from free-form requirement text.
 *
 * @returns The inferred component type, or "swc" when no specific domain role is detected.
 */
export function inferComponentTypeFromRequirements(requirements: string): string {
	const text = requirements.trim()
	if (!text) {
		return "swc"
	}

	for (const rule of COMPONENT_TYPE_RULES) {
		if (matchesAny(text, rule.patterns)) {
			return rule.componentType
		}
	}

	return "swc"
}

/**
 * Infers BMS AUTOSAR runnables from free-form requirement text.
 *
 * Like {@link inferPortsFromRequirements}, this is a lightweight fallback for
 * when the caller did not explicitly provide a runnables list.
 */
export function inferRunnablesFromRequirements(requirements: string): BmsAutosarRunnable[] {
	const text = requirements.trim()
	if (!text) {
		return []
	}

	const seen = new Set<string>()
	const runnables: BmsAutosarRunnable[] = []

	for (const rule of RUNNABLE_RULES) {
		if (matchesAny(text, rule.patterns) && !seen.has(rule.runnable.name)) {
			seen.add(rule.runnable.name)
			runnables.push(rule.runnable)
		}
	}

	return runnables
}
