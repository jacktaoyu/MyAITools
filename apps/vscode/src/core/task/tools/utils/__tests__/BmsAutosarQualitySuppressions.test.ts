import { strict as assert } from "node:assert"
import { describe, it } from "mocha"
import { parseQualitySuppressions } from "../BmsAutosarQualitySuppressions"

describe("parseQualitySuppressions", () => {
	it("returns false when no suppression comments exist", () => {
		const state = parseQualitySuppressions("void BmsTest_Run(void) { }\n")
		assert.equal(state.isSuppressed("R21.3", 1), false)
	})

	it("supports disable-line for the current line", () => {
		const state = parseQualitySuppressions("malloc(1); // bms-qg-disable-line R21.3\nmalloc(2);\n")
		assert.equal(state.isSuppressed("R21.3", 1), true)
		assert.equal(state.isSuppressed("R21.3", 2), false)
		assert.equal(state.isSuppressed("R17.7", 1), false)
	})

	it("supports disable-next-line for the following line", () => {
		const state = parseQualitySuppressions("// bms-qg-disable-next-line R21.3\nmalloc(1);\nmalloc(2);\n")
		assert.equal(state.isSuppressed("R21.3", 2), true)
		assert.equal(state.isSuppressed("R21.3", 3), false)
	})

	it("supports block disable/enable", () => {
		const state = parseQualitySuppressions(
			"// bms-qg-disable R21.3\nmalloc(1);\n// bms-qg-enable R21.3\nmalloc(2);\n",
		)
		assert.equal(state.isSuppressed("R21.3", 2), true)
		assert.equal(state.isSuppressed("R21.3", 4), false)
	})

	it("supports disable all", () => {
		const state = parseQualitySuppressions("// bms-qg-disable all\nmalloc(1);\nprintf(\"hi\");\n")
		assert.equal(state.isSuppressed("R21.3", 2), true)
		assert.equal(state.isSuppressed("R21.6", 3), true)
	})

	it("is case-insensitive for rule ids", () => {
		const state = parseQualitySuppressions("malloc(1); // bms-qg-disable-line r21.3\n")
		assert.equal(state.isSuppressed("R21.3", 1), true)
	})

	it("supports multiple rules in one comment", () => {
		const state = parseQualitySuppressions("malloc(1); // bms-qg-disable-line R21.3, R17.7\n")
		assert.equal(state.isSuppressed("R21.3", 1), true)
		assert.equal(state.isSuppressed("R17.7", 1), true)
	})
})
