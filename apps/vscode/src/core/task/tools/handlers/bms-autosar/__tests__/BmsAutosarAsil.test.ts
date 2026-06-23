import { strict as assert } from "node:assert"
import { describe, it } from "mocha"
import { asilLabel, DEFAULT_ASIL_LEVEL, getAsilDesignGuidelines, isAsil, isHighAsil, normalizeAsilLevel } from "../BmsAutosarAsil"

describe("BmsAutosarAsil", () => {
	describe("normalizeAsilLevel", () => {
		it("defaults to QM for empty input", () => {
			assert.equal(normalizeAsilLevel(undefined), DEFAULT_ASIL_LEVEL)
			assert.equal(normalizeAsilLevel(""), DEFAULT_ASIL_LEVEL)
		})

		it("normalizes valid ASIL strings", () => {
			assert.equal(normalizeAsilLevel("ASIL_D"), "ASIL_D")
			assert.equal(normalizeAsilLevel("asil-c"), "ASIL_C")
			assert.equal(normalizeAsilLevel("QM"), "QM")
			assert.equal(normalizeAsilLevel("  asil_b  "), "ASIL_B")
		})

		it("falls back to QM for unknown values", () => {
			assert.equal(normalizeAsilLevel("SIL-4"), "QM")
			assert.equal(normalizeAsilLevel("random"), "QM")
		})
	})

	describe("ASIL predicates", () => {
		it("identifies high ASIL levels", () => {
			assert.equal(isHighAsil("ASIL_C"), true)
			assert.equal(isHighAsil("ASIL_D"), true)
			assert.equal(isHighAsil("ASIL_A"), false)
			assert.equal(isHighAsil("QM"), false)
		})

		it("identifies any ASIL above QM", () => {
			assert.equal(isAsil("ASIL_A"), true)
			assert.equal(isAsil("ASIL_D"), true)
			assert.equal(isAsil("QM"), false)
		})
	})

	describe("asilLabel", () => {
		it("returns human-readable labels", () => {
			assert.equal(asilLabel("QM"), "QM (Quality Management)")
			assert.equal(asilLabel("ASIL_D"), "ASIL D")
		})
	})

	describe("getAsilDesignGuidelines", () => {
		it("returns lightweight guidelines for QM", () => {
			const guidelines = getAsilDesignGuidelines("QM")
			assert.ok(guidelines.includes("MISRA"))
			assert.ok(!guidelines.includes("WdgM"))
		})

		it("adds range checks for ASIL A/B", () => {
			const guidelines = getAsilDesignGuidelines("ASIL_B")
			assert.ok(guidelines.includes("range checks"))
			assert.ok(!guidelines.includes("WdgM"))
		})

		it("includes safety patterns for ASIL C/D", () => {
			const guidelines = getAsilDesignGuidelines("ASIL_D")
			assert.ok(guidelines.includes("WdgM"))
			assert.ok(guidelines.includes("E2E"))
			assert.ok(guidelines.includes("safe states"))
		})
	})
})
