export interface WizardPreset {
	componentName: string
	requirements: string
	portsJson: string
	runnablesJson: string
	outputFormat: string
	asilLevel?: string
}

export const COMPONENT_PRESETS: Record<string, WizardPreset> = {
	swc: {
		componentName: "BmsApplicationSwc",
		requirements:
			"Generic AUTOSAR application SWC. Provide sender-receiver ports for data exchange and runnables triggered by timing events.",
		portsJson: JSON.stringify(
			[
				{ name: "StateOfCharge", direction: "provided", interface_type: "S/R", data_type: "Percent_Type" },
				{ name: "CellVoltage", direction: "required", interface_type: "S/R", data_type: "Adc_VoltageType" },
			],
			null,
			2,
		),
		runnablesJson: JSON.stringify([{ name: "Run100ms", event: "TimingEvent", period_ms: 100 }], null, 2),
		outputFormat: "both",
	},
	bsw_module: {
		componentName: "BmsBswModule",
		requirements:
			"AUTOSAR Classic BSW module with Init and MainFunction. Provide DET error reporting hooks and configuration headers.",
		portsJson: "",
		runnablesJson: JSON.stringify([{ name: "MainFunction", event: "TimingEvent", period_ms: 10 }], null, 2),
		outputFormat: "both",
	},
	rte_interface: {
		componentName: "BmsRteInterface",
		requirements: "Sender-receiver interface for RTE data exchange between BMS SWCs.",
		portsJson: JSON.stringify(
			[
				{ name: "BatteryStatus", direction: "provided", interface_type: "S/R", data_type: "uint16" },
				{ name: "PowerLimit", direction: "required", interface_type: "S/R", data_type: "sint16" },
			],
			null,
			2,
		),
		runnablesJson: "",
		outputFormat: "c_code",
	},
	arxml_descriptor: {
		componentName: "BmsArxmlDescriptor",
		requirements: "ARXML package descriptor for BMS components.",
		portsJson: "",
		runnablesJson: "",
		outputFormat: "arxml",
	},
	service: {
		componentName: "BmsDiagnosticService",
		requirements:
			"AUTOSAR service SWC exposing diagnostic services via client-server interfaces. Include DTC read/clear operations.",
		portsJson: JSON.stringify(
			[{ name: "DiagnosticServices", direction: "provided", interface_type: "C/S", data_type: "Dcm_DataType" }],
			null,
			2,
		),
		runnablesJson: JSON.stringify([{ name: "Run10ms", event: "TimingEvent", period_ms: 10 }], null, 2),
		outputFormat: "both",
	},
	ecu_extract: {
		componentName: "BmsEcuExtract",
		requirements: "ECU-level composition extract referencing BMS SWC prototypes.",
		portsJson: "",
		runnablesJson: "",
		outputFormat: "arxml",
	},
	bms_csc: {
		componentName: "BmsCscFront",
		requirements:
			"Cell Supervision Circuit (CSC/AFE) interface. Measure cell voltages and temperatures, report via slave communication bus, trigger alerts on over/under voltage or temperature.",
		portsJson: JSON.stringify(
			[
				{ name: "CellVoltage_Slave", direction: "provided", interface_type: "S/R", data_type: "Adc_VoltageType" },
				{ name: "CellTemperature_Slave", direction: "provided", interface_type: "S/R", data_type: "Temperature_DegCType" },
				{ name: "AlertStatus", direction: "provided", interface_type: "S/R", data_type: "uint8" },
			],
			null,
			2,
		),
		runnablesJson: JSON.stringify([{ name: "Run100ms", event: "TimingEvent", period_ms: 100 }], null, 2),
		outputFormat: "both",
	},
	bms_controller: {
		componentName: "BmsController",
		requirements:
			"BMS master controller. Manage HV state machine, pre-charge sequence, contactor control, and system mode transitions. Safety-critical: single exit point, initialize locals.",
		portsJson: JSON.stringify(
			[
				{ name: "ContactorControl", direction: "provided", interface_type: "S/R", data_type: "uint8" },
				{ name: "PreChargeStatus", direction: "required", interface_type: "S/R", data_type: "uint8" },
				{ name: "HvRequest", direction: "required", interface_type: "S/R", data_type: "uint8" },
			],
			null,
			2,
		),
		runnablesJson: JSON.stringify(
			[
				{ name: "Run10ms", event: "TimingEvent", period_ms: 10 },
				{ name: "Init", event: "OperationInvokedEvent" },
			],
			null,
			2,
		),
		outputFormat: "both",
	},
	bms_balancer: {
		componentName: "BmsBalancer",
		requirements:
			"Passive cell balancing control. Compute balance duty based on max/min cell voltage, command balance resistors, include over-voltage protection interlock.",
		portsJson: JSON.stringify(
			[
				{ name: "CellVoltage", direction: "required", interface_type: "S/R", data_type: "Adc_VoltageType" },
				{ name: "BalanceCommand", direction: "provided", interface_type: "S/R", data_type: "uint16" },
			],
			null,
			2,
		),
		runnablesJson: JSON.stringify([{ name: "Run1s", event: "TimingEvent", period_ms: 1000 }], null, 2),
		outputFormat: "both",
	},
	bms_thermal_manager: {
		componentName: "BmsThermalManager",
		requirements:
			"Battery thermal management. Read cell temperatures, compute cooling/heating PWM, detect thermal runaway conditions, and request HVAC support.",
		portsJson: JSON.stringify(
			[
				{ name: "CellTemperature", direction: "required", interface_type: "S/R", data_type: "Temperature_DegCType" },
				{ name: "CoolingPwm", direction: "provided", interface_type: "S/R", data_type: "Percent_Type" },
				{ name: "HeatingPwm", direction: "provided", interface_type: "S/R", data_type: "Percent_Type" },
			],
			null,
			2,
		),
		runnablesJson: JSON.stringify([{ name: "Run100ms", event: "TimingEvent", period_ms: 100 }], null, 2),
		outputFormat: "both",
	},
	bms_charger: {
		componentName: "BmsCharger",
		requirements:
			"AC/DC charging control. Implement CC/CV charging profile, negotiate charge current/voltage with charger, monitor connector status, and terminate on fault.",
		portsJson: JSON.stringify(
			[
				{ name: "ChargerVoltage", direction: "required", interface_type: "S/R", data_type: "Adc_VoltageType" },
				{ name: "ChargerCurrent", direction: "required", interface_type: "S/R", data_type: "Current_AmpType" },
				{ name: "ChargeRequest", direction: "provided", interface_type: "S/R", data_type: "uint16" },
			],
			null,
			2,
		),
		runnablesJson: JSON.stringify([{ name: "Run100ms", event: "TimingEvent", period_ms: 100 }], null, 2),
		outputFormat: "both",
	},
	bms_diagnosis: {
		componentName: "BmsDiagnosis",
		requirements:
			"BMS diagnosis manager. Report DTCs for over-voltage, under-voltage, over-temperature, and communication faults. Integrate with DEM/Dcm services.",
		portsJson: JSON.stringify(
			[
				{ name: "FaultStatus", direction: "provided", interface_type: "S/R", data_type: "uint32" },
				{ name: "DiagnosticServices", direction: "required", interface_type: "C/S", data_type: "Dcm_DataType" },
			],
			null,
			2,
		),
		runnablesJson: JSON.stringify([{ name: "Run10ms", event: "TimingEvent", period_ms: 10 }], null, 2),
		outputFormat: "both",
	},
}
