import { strict as assert } from "node:assert"
import { describe, it } from "mocha"
import { formatMisraReport, formatMisraSummary, runMisraChecks } from "../BmsAutosarMisraChecker"

describe("BmsAutosarMisraChecker", () => {
	it("detects forbidden stdlib memory functions (R21.3)", () => {
		const content = `
#include <stdlib.h>
void Bms_Test_Init(void) {
    uint8* p = (uint8*)malloc(10);
    free(p);
    calloc(1, 2);
    realloc(p, 20);
}
`
		const result = runMisraChecks("Bms_Test.c", content)
		assert.ok(result.summary.errors >= 4)
		assert.ok(result.issues.some((i) => i.rule === "R21.3" && i.message.includes("malloc")))
		assert.ok(result.issues.some((i) => i.rule === "R21.3" && i.message.includes("free")))
	})

	it("detects forbidden stdio functions (R21.6)", () => {
		const content = `
void Bms_Test_Log(void) {
    printf("hello");
    sprintf(buf, "%d", x);
}
`
		const result = runMisraChecks("Bms_Test.c", content)
		assert.ok(result.issues.some((i) => i.rule === "R21.6"))
	})

	it("detects octal constants (R7.1)", () => {
		const content = `
void Bms_Test_Fmt(void) {
    uint8 x = 077;
}
`
		const result = runMisraChecks("Bms_Test.c", content)
		assert.ok(result.issues.some((i) => i.rule === "R7.1" && i.message.includes("077")))
	})

	it("detects multiple return statements (R15.5)", () => {
		const content = `
Std_ReturnType Bms_Test_Cond(uint8 x) {
    if (x == 0) {
        return E_NOT_OK;
    }
    return E_OK;
}
`
		const result = runMisraChecks("Bms_Test.c", content)
		assert.ok(result.issues.some((i) => i.rule === "R15.5" && i.message.includes("Bms_Test_Cond")))
	})

	it("detects uninitialized local variables (R9.1)", () => {
		const content = `
void Bms_Test_Calc(void) {
    uint16 temperature;
    temperature = temperature + 1;
}
`
		const result = runMisraChecks("Bms_Test.c", content)
		assert.ok(result.issues.some((i) => i.rule === "R9.1" && i.message.includes("temperature")))
	})

	it("reports no issues for clean MISRA-style code", () => {
		const content = `
#ifndef BMS_TEST_H
#define BMS_TEST_H

#include "Std_Types.h"

Std_ReturnType Bms_Test_Run(void);

#endif
`
		const result = runMisraChecks("Bms_Test.h", content)
		assert.equal(result.summary.errors, 0)
		assert.equal(result.summary.warnings, 0)
		assert.ok(formatMisraReport(result).includes("No MISRA-style issues detected"))
	})

	it("formats a summary across multiple files", () => {
		const results = [
			runMisraChecks("A.c", "void f(void){ malloc(1); }"),
			runMisraChecks("B.c", "void g(void){ uint16 x; x = x + 1; }"),
		]
		const summary = formatMisraSummary(results)
		assert.ok(summary.includes("Checked 2 file(s)"))
	})

	it("filters ASIL-specific rules by target ASIL level", () => {
		const content = `
Std_ReturnType Bms_Test_Cond(uint8 x) {
    if (x == 0) {
        return E_NOT_OK;
    }
    return E_OK;
}
`
		const qmResult = runMisraChecks("Bms_Test.c", content, { asilLevel: "QM" })
		assert.ok(!qmResult.issues.some((i) => i.rule === "SAFETY-EXIT"))
		assert.ok(qmResult.issues.some((i) => i.rule === "R15.5"))

		const asilDResult = runMisraChecks("Bms_Test.c", content, { asilLevel: "ASIL_D" })
		assert.ok(asilDResult.issues.some((i) => i.rule === "SAFETY-EXIT"))
		assert.ok(!asilDResult.issues.some((i) => i.rule === "R15.5"))
	})

	it("promotes advisory rules to errors under ASIL C/D", () => {
		const content = `
uint8 g_counter = 0u;
void Bms_Test_Counter(void) {
    g_counter++;
}
`
		const asilBResult = runMisraChecks("Bms_Test.c", content, { asilLevel: "ASIL_B" })
		const r8_9B = asilBResult.issues.find((i) => i.rule === "R8.9")
		assert.ok(r8_9B)
		assert.equal(r8_9B.severity, "warning")

		const asilCResult = runMisraChecks("Bms_Test.c", content, { asilLevel: "ASIL_C" })
		const r8_9C = asilCResult.issues.find((i) => i.rule === "R8.9")
		assert.ok(r8_9C)
		assert.equal(r8_9C.severity, "error")
	})
})
