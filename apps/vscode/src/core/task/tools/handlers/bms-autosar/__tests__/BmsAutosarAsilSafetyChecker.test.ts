import { strict as assert } from "node:assert"
import { describe, it } from "mocha"
import { inferAsilLevel, runAsilSafetyChecks } from "../BmsAutosarAsilSafetyChecker"

describe("BmsAutosarAsilSafetyChecker", () => {
	it("infers ASIL level from the file header tag", () => {
		assert.equal(inferAsilLevel("/** \\ASIL level: ASIL-D */"), "ASIL_D")
		assert.equal(inferAsilLevel("/** \\ASIL level: ASIL_B */"), "ASIL_B")
		assert.equal(inferAsilLevel("/** \\ASIL level: QM */"), "QM")
		assert.equal(inferAsilLevel("no tag here"), "QM")
	})

	it("skips ASIL checks for QM files", () => {
		const content = `
void Bms_Test_Run(void) {
    return;
}
`
		const issues = runAsilSafetyChecks(content, "QM")
		assert.equal(issues.length, 0)
	})

	it("warns about missing WdgM, E2E, and DET references under high ASIL", () => {
		const content = `
/** \\ASIL level: ASIL-D */
void Bms_Test_Run(void) {
    return;
}
`
		const issues = runAsilSafetyChecks(content, "ASIL_D")
		assert.ok(issues.some((i) => i.rule === "SAFETY-WDGM"))
		assert.ok(issues.some((i) => i.rule === "SAFETY-E2E"))
		assert.ok(issues.some((i) => i.rule === "SAFETY-DET"))
	})

	it("does not warn when WdgM, E2E, and DET references are present", () => {
		const content = `
/** \\ASIL level: ASIL-D */
void Bms_Test_Run(void) {
    WdgM_CheckpointReached(0, 0);
    E2E_P05Protect(&config, &data);
    Det_ReportError(0, 0, 0, 0);
}
`
		const issues = runAsilSafetyChecks(content, "ASIL_D")
		assert.ok(!issues.some((i) => i.rule === "SAFETY-WDGM"))
		assert.ok(!issues.some((i) => i.rule === "SAFETY-E2E"))
		assert.ok(!issues.some((i) => i.rule === "SAFETY-DET"))
	})

	it("warns when no range checks are found under high ASIL", () => {
		const content = `
/** \\ASIL level: ASIL-C */
void Bms_Test_Process(uint8 input) {
    uint8 output = input;
}
`
		const issues = runAsilSafetyChecks(content, "ASIL_C")
		assert.ok(issues.some((i) => i.rule === "SAFETY-RANGE"))
	})

	it("does not warn about range checks when validation exists", () => {
		const content = `
/** \\ASIL level: ASIL-C */
void Bms_Test_Process(uint8 input) {
    if (input > 100u) {
        return;
    }
}
`
		const issues = runAsilSafetyChecks(content, "ASIL_C")
		assert.ok(!issues.some((i) => i.rule === "SAFETY-RANGE"))
	})

	it("flags multiple return statements as errors under high ASIL", () => {
		const content = `
/** \\ASIL level: ASIL-D */
Std_ReturnType Bms_Test_Cond(uint8 x) {
    if (x == 0) {
        return E_NOT_OK;
    }
    return E_OK;
}
`
		const issues = runAsilSafetyChecks(content, "ASIL_D")
		const exitIssue = issues.find((i) => i.rule === "SAFETY-EXIT")
		assert.ok(exitIssue)
		assert.equal(exitIssue.severity, "error")
	})
})
