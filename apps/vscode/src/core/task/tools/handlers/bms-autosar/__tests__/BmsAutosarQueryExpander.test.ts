import { strict as assert } from "node:assert"
import { describe, it } from "mocha"
import { expandAutosarQuery, parseAutosarIntent } from "../BmsAutosarQueryExpander"

describe("BmsAutosarQueryExpander", () => {
	it("returns empty expansion for empty query", () => {
		const result = expandAutosarQuery("  ")
		assert.equal(result.expanded, "")
		assert.deepStrictEqual(result.addedTerms, [])
	})

	it("returns the original query when no synonyms match", () => {
		const result = expandAutosarQuery("hello world")
		assert.equal(result.expanded, "hello world")
		assert.deepStrictEqual(result.addedTerms, [])
	})

	it("expands BMS acronyms", () => {
		const result = expandAutosarQuery("Generate BMS SOC estimator")
		assert.ok(result.expanded.includes("BatteryManagementSystem"))
		assert.ok(result.expanded.includes("StateOfCharge"))
		assert.ok(result.addedTerms.includes("BatteryManagementSystem"))
		assert.ok(result.addedTerms.includes("StateOfCharge"))
	})

	it("expands CSC and AFE as cross-synonyms", () => {
		const cscResult = expandAutosarQuery("CSC voltage measurement")
		assert.ok(cscResult.expanded.includes("CellSupervisionCircuit"))
		assert.ok(cscResult.expanded.includes("AnalogFrontEnd"))

		const afeResult = expandAutosarQuery("AFE diagnostics")
		assert.ok(afeResult.expanded.includes("AnalogFrontEnd"))
		assert.ok(afeResult.expanded.includes("CellSupervisionCircuit"))
	})

	it("does not duplicate the original query terms", () => {
		const result = expandAutosarQuery("SOC")
		assert.equal(result.expanded, "SOC StateOfCharge")
	})

	it("deduplicates added synonyms", () => {
		const result = expandAutosarQuery("SOC SOH state-estimation")
		const stateOfChargeCount = result.addedTerms.filter((term) => term === "StateOfCharge").length
		assert.equal(stateOfChargeCount, 1)
	})

	describe("parseAutosarIntent", () => {
		it("detects component lookup intent", () => {
			assert.equal(parseAutosarIntent("Generate a BMS controller SWC"), "component_lookup")
			assert.equal(parseAutosarIntent("CSC voltage measurement"), "component_lookup")
		})

		it("detects safety guidance intent", () => {
			assert.equal(parseAutosarIntent("ASIL D safety requirements"), "safety_guidance")
			assert.equal(parseAutosarIntent("WdgM E2E monitoring"), "safety_guidance")
		})

		it("detects interface search intent", () => {
			assert.equal(parseAutosarIntent("RTE sender receiver interface"), "interface_search")
			assert.equal(parseAutosarIntent("CAN signal PDU"), "interface_search")
		})

		it("defaults to general intent", () => {
			assert.equal(parseAutosarIntent("hello world"), "general")
		})

		it("includes intent in query expansion", () => {
			const result = expandAutosarQuery("ASIL B CSC requirements")
			assert.equal(result.intent, "safety_guidance")
		})
	})
})
