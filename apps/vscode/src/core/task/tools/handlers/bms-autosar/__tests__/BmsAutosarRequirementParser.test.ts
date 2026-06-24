import { strict as assert } from "node:assert"
import { describe, it } from "mocha"
import {
	inferComponentTypeFromRequirements,
	inferPortsFromRequirements,
	inferRunnablesFromRequirements,
} from "../BmsAutosarRequirementParser"

describe("BmsAutosarRequirementParser", () => {
	describe("inferPortsFromRequirements", () => {
		it("returns an empty array for empty requirements", () => {
			assert.deepStrictEqual(inferPortsFromRequirements(""), [])
			assert.deepStrictEqual(inferPortsFromRequirements("   "), [])
		})

		it("infers cell voltage port", () => {
			const ports = inferPortsFromRequirements("Measure cell voltage every 10ms")
			assert.equal(ports.length, 1)
			assert.equal(ports[0].name, "CellVoltage")
			assert.equal(ports[0].interface_type, "S/R")
			assert.equal(ports[0].direction, "required")
		})

		it("infers multiple BMS ports", () => {
			const ports = inferPortsFromRequirements(
				"The SWC reads cell voltage and temperature, estimates SOC and SOH, and reports DTCs via diagnosis.",
			)
			const names = ports.map((p) => p.name)
			assert.ok(names.includes("CellVoltage"))
			assert.ok(names.includes("CellTemperature"))
			assert.ok(names.includes("StateOfCharge"))
			assert.ok(names.includes("StateOfHealth"))
			assert.ok(names.includes("DiagnosisRequest"))
		})

		it("does not duplicate ports when multiple keywords match the same rule", () => {
			const ports = inferPortsFromRequirements("cell voltage voltage measurement")
			assert.equal(ports.length, 1)
		})

		it("infers BMS domain-specific ports", () => {
			const ports = inferPortsFromRequirements(
				"Thermal manager reads cell temperature, controls cooling PWM and heating PWM, and reports thermal runaway.",
			)
			const names = ports.map((p) => p.name)
			assert.ok(names.includes("CellTemperature"))
			assert.ok(names.includes("CoolingPwm"))
			assert.ok(names.includes("HeatingPwm"))
			assert.ok(names.includes("ThermalRunaway"))
		})

		it("infers charger and controller ports", () => {
			const ports = inferPortsFromRequirements(
				"BMS controller reads pack current and HV request, controls contactors and pre-charge. Charger reads charger voltage and current.",
			)
			const names = ports.map((p) => p.name)
			assert.ok(names.includes("PackCurrent"))
			assert.ok(names.includes("HvRequest"))
			assert.ok(names.includes("PreChargeStatus"))
			assert.ok(names.includes("ChargerVoltage"))
			assert.ok(names.includes("ChargerCurrent"))
		})

		it("infers state estimator and power limiter ports", () => {
			const ports = inferPortsFromRequirements(
				"Estimate SOC, SOH, SOP, and SOE using cell voltage, temperature, and pack current. Compute charge and discharge power limits.",
			)
			const names = ports.map((p) => p.name)
			assert.ok(names.includes("StateOfCharge"))
			assert.ok(names.includes("StateOfHealth"))
			assert.ok(names.includes("StateOfPower"))
			assert.ok(names.includes("StateOfEnergy"))
			assert.ok(names.includes("ChargePowerLimit"))
			assert.ok(names.includes("DischargePowerLimit"))
		})

		it("infers insulation monitor and current sensor ports", () => {
			const ports = inferPortsFromRequirements(
				"Monitor HV bus insulation resistance and detect insulation fault. Measure pack current from a Hall sensor raw ADC input.",
			)
			const names = ports.map((p) => p.name)
			assert.ok(names.includes("HvBusVoltage"))
			assert.ok(names.includes("InsulationResistance"))
			assert.ok(names.includes("InsulationFault"))
			assert.ok(names.includes("RawAdcCurrent"))
		})
	})

	describe("inferRunnablesFromRequirements", () => {
		it("returns an empty array for empty requirements", () => {
			assert.deepStrictEqual(inferRunnablesFromRequirements(""), [])
		})

		it("infers 10ms and 100ms timing events", () => {
			const runnables = inferRunnablesFromRequirements("Run fast control every 10ms and slow estimation every 100ms")
			const names = runnables.map((r) => r.name)
			assert.ok(names.includes("Run10ms"))
			assert.ok(names.includes("Run100ms"))
		})

		it("infers init runnable", () => {
			const runnables = inferRunnablesFromRequirements("Initialize the module on startup")
			assert.equal(runnables.length, 1)
			assert.equal(runnables[0].name, "Init")
			assert.equal(runnables[0].event, "OperationInvokedEvent")
		})

		it("infers data received runnable", () => {
			const runnables = inferRunnablesFromRequirements("Process data received event for cell voltage")
			assert.equal(runnables.length, 1)
			assert.equal(runnables[0].name, "DataReceivedRunnable")
			assert.equal(runnables[0].event, "DataReceivedEvent")
		})
	})

	describe("inferComponentTypeFromRequirements", () => {
		it("defaults to swc for empty or generic requirements", () => {
			assert.equal(inferComponentTypeFromRequirements(""), "swc")
			assert.equal(inferComponentTypeFromRequirements("create a generic component"), "swc")
		})

		it("infers bms_csc from CSC/AFE keywords", () => {
			assert.equal(inferComponentTypeFromRequirements("Create a CSC/ASIC slave interface"), "bms_csc")
		})

		it("infers bms_controller from controller keywords", () => {
			assert.equal(inferComponentTypeFromRequirements("BMS controller handles contactors and pre-charge"), "bms_controller")
		})

		it("infers bms_balancer from balance keywords", () => {
			assert.equal(inferComponentTypeFromRequirements("Implement passive cell balancing"), "bms_balancer")
		})

		it("infers bms_thermal_manager from thermal keywords", () => {
			assert.equal(inferComponentTypeFromRequirements("Manage pack cooling and heating"), "bms_thermal_manager")
		})

		it("infers bms_charger from charger keywords", () => {
			assert.equal(inferComponentTypeFromRequirements("Control AC/DC charger with CC/CV"), "bms_charger")
		})

		it("infers bms_diagnosis from diagnosis keywords", () => {
			assert.equal(inferComponentTypeFromRequirements("Manage DTCs and DEM faults"), "bms_diagnosis")
		})

		it("infers bms_state_estimator from SOC/SOH/SOP keywords", () => {
			assert.equal(inferComponentTypeFromRequirements("Estimate SOC and SOH with a Kalman filter"), "bms_state_estimator")
			assert.equal(inferComponentTypeFromRequirements("Compute SOP and SOE"), "bms_state_estimator")
		})

		it("infers bms_power_limiter from power limit keywords", () => {
			assert.equal(inferComponentTypeFromRequirements("Calculate charge and discharge power limits"), "bms_power_limiter")
		})

		it("infers bms_insulation_monitor from insulation keywords", () => {
			assert.equal(inferComponentTypeFromRequirements("Monitor HV isolation resistance"), "bms_insulation_monitor")
		})

		it("infers bms_current_sensor from current sensor keywords", () => {
			assert.equal(inferComponentTypeFromRequirements("Hall sensor current measurement"), "bms_current_sensor")
		})
	})
})
