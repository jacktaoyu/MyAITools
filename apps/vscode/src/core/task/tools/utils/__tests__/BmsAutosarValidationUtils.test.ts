import { strict as assert } from "node:assert"
import { describe, it } from "mocha"
import {
	formatValidationReport,
	shouldValidateAutosarFile,
	validateArxml,
	validateAutosarFile,
	validateCHeader,
	validateCSource,
} from "../BmsAutosarValidationUtils"

describe("BmsAutosarValidationUtils", () => {
	describe("shouldValidateAutosarFile", () => {
		it("validates all .arxml files", () => {
			assert.ok(shouldValidateAutosarFile("package.arxml"))
			assert.ok(shouldValidateAutosarFile("some/path/BmsCellMonitor.arxml"))
		})

		it("validates BMS-prefixed .c/.h files", () => {
			assert.ok(shouldValidateAutosarFile("BmsCellMonitor.c"))
			assert.ok(shouldValidateAutosarFile("BmsCellMonitor.h"))
			assert.ok(shouldValidateAutosarFile("BmsDiagnostic_Cfg.h"))
			assert.ok(shouldValidateAutosarFile("src/bms/BmsStateEstimator.c"))
		})

		it("validates files with bms_/autosar in the name", () => {
			assert.ok(shouldValidateAutosarFile("some_bms_component.c"))
			assert.ok(shouldValidateAutosarFile("autosar_helper.h"))
		})

		it("ignores unrelated .c/.h files", () => {
			assert.ok(!shouldValidateAutosarFile("main.c"))
			assert.ok(!shouldValidateAutosarFile("utils.h"))
			assert.ok(!shouldValidateAutosarFile("src/helpers/parser.c"))
		})

		it("ignores non-source extensions", () => {
			assert.ok(!shouldValidateAutosarFile("README.md"))
			assert.ok(!shouldValidateAutosarFile("data.json"))
		})
	})

	describe("validateArxml", () => {
		it("passes for a minimal valid AUTOSAR ARXML", () => {
			const xml = `<?xml version="1.0" encoding="UTF-8"?>
<AUTOSAR xmlns="http://autosar.org/schema/r4.0">
  <AR-PACKAGES>
    <AR-PACKAGE>
      <SHORT-NAME>BmsCellMonitor</SHORT-NAME>
    </AR-PACKAGE>
  </AR-PACKAGES>
</AUTOSAR>`
			const result = validateArxml(xml)
			assert.equal(result.issues.length, 0)
		})

		it("reports missing AUTOSAR root", () => {
			const result = validateArxml(`<?xml version="1.0"?><AR-PACKAGE><SHORT-NAME>X</SHORT-NAME></AR-PACKAGE>`)
			assert.ok(result.issues.some((i) => i.message.includes("Root element is not <AUTOSAR>")))
		})

		it("reports missing SHORT-NAME", () => {
			const result = validateArxml(`<?xml version="1.0"?><AUTOSAR><AR-PACKAGE></AR-PACKAGE></AUTOSAR>`)
			assert.ok(result.issues.some((i) => i.message.includes("No <SHORT-NAME>")))
		})

		it("accepts service component type ARXML", () => {
			const xml = `<?xml version="1.0"?>
<AUTOSAR>
  <AR-PACKAGE>
    <SHORT-NAME>ServicePkg</SHORT-NAME>
    <ELEMENTS>
      <SERVICE-SW-COMPONENT-TYPE>
        <SHORT-NAME>BmsDiagnosticService</SHORT-NAME>
      </SERVICE-SW-COMPONENT-TYPE>
    </ELEMENTS>
  </AR-PACKAGE>
</AUTOSAR>`
			const result = validateArxml(xml)
			assert.ok(!result.issues.some((i) => i.message.includes("recognized AUTOSAR component type")))
		})

		it("accepts composition component type ARXML", () => {
			const xml = `<?xml version="1.0"?>
<AUTOSAR>
  <AR-PACKAGE>
    <SHORT-NAME>CompPkg</SHORT-NAME>
    <ELEMENTS>
      <COMPOSITION-SW-COMPONENT-TYPE>
        <SHORT-NAME>BmsEcuComposition</SHORT-NAME>
      </COMPOSITION-SW-COMPONENT-TYPE>
    </ELEMENTS>
  </AR-PACKAGE>
</AUTOSAR>`
			const result = validateArxml(xml)
			assert.ok(!result.issues.some((i) => i.message.includes("recognized AUTOSAR component type")))
		})

		it("reports unclosed tag", () => {
			const result = validateArxml(`<AUTOSAR><AR-PACKAGE><SHORT-NAME>X</SHORT-NAME></AR-PACKAGE>`)
			assert.ok(result.issues.some((i) => i.message.includes("Unclosed tag")))
		})

		it("reports mismatched tags", () => {
			const result = validateArxml(`<AUTOSAR><AR-PACKAGE></ELEMENTS></AUTOSAR>`)
			assert.ok(result.issues.some((i) => i.message.includes("Mismatched tags")))
		})

		it("handles self-closing tags", () => {
			const result = validateArxml(`<AUTOSAR><ADMIN-DATA/><SHORT-NAME>X</SHORT-NAME></AUTOSAR>`)
			assert.equal(result.issues.length, 0)
		})

		it("reports ARXML references with empty paths", () => {
			const xml = `<AUTOSAR><AR-PACKAGE><SHORT-NAME>X</SHORT-NAME><ELEMENTS><R-PORT-PROTOTYPE><SHORT-NAME>P</SHORT-NAME><REQUIRED-INTERFACE-TREF DEST=\"SENDER-RECEIVER-INTERFACE\"></REQUIRED-INTERFACE-TREF></R-PORT-PROTOTYPE></ELEMENTS></AR-PACKAGE></AUTOSAR>`
			const result = validateArxml(xml)
			assert.ok(result.issues.some((i) => i.message.includes("empty reference path")))
		})

		it("warns when TYPE-TREF is missing DEST", () => {
			const xml = `<AUTOSAR><AR-PACKAGE><SHORT-NAME>X</SHORT-NAME><ELEMENTS><VARIABLE-DATA-PROTOTYPE><SHORT-NAME>V</SHORT-NAME><TYPE-TREF>/Types/Uint8</TYPE-TREF></VARIABLE-DATA-PROTOTYPE></ELEMENTS></AR-PACKAGE></AUTOSAR>`
			const result = validateArxml(xml)
			assert.ok(result.issues.some((i) => i.message.includes("missing the DEST attribute")))
		})

		it("warns when TYPE-TREF DEST does not match expected value", () => {
			const xml = `<AUTOSAR><AR-PACKAGE><SHORT-NAME>X</SHORT-NAME><ELEMENTS><VARIABLE-DATA-PROTOTYPE><SHORT-NAME>V</SHORT-NAME><TYPE-TREF DEST=\"APPLICATION-PRIMITIVE-DATA-TYPE\">/Types/Uint8</TYPE-TREF></VARIABLE-DATA-PROTOTYPE></ELEMENTS></AR-PACKAGE></AUTOSAR>`
			const result = validateArxml(xml)
			assert.ok(result.issues.some((i) => i.message.includes("does not match the expected")))
		})
	})

	describe("validateCSource", () => {
		it("flags malloc/free/calloc/realloc", () => {
			const result = validateCSource(`void f(void) { int* p = malloc(4); free(p); }`)
			assert.ok(result.issues.some((i) => i.message.includes("malloc")))
			assert.ok(result.issues.some((i) => i.message.includes("free")))
		})

		it("flags goto", () => {
			const result = validateCSource(`void f(void) { error: goto error; }`)
			assert.ok(result.issues.some((i) => i.message.includes("goto")))
		})

		it("warns when no function is found", () => {
			const result = validateCSource(`int x = 0;`)
			assert.ok(result.issues.some((i) => i.message.includes("No function declaration")))
		})

		it("info TODO markers", () => {
			const result = validateCSource(`void f(void) { /* TODO: implement */ }`)
			assert.ok(result.issues.some((i) => i.message.includes("TODO")))
		})

		it("ignores keywords inside comments", () => {
			const result = validateCSource(`/* malloc is not used here */\nvoid f(void) { }`)
			assert.ok(!result.issues.some((i) => i.message.includes("malloc")))
		})

		it("info magic numbers in function bodies", () => {
			const result = validateCSource(`void Bms_Foo(void) { uint8 x = 42; }`)
			assert.ok(result.issues.some((i) => i.message.includes("magic numbers")))
		})

		it("warns about uninitialized local variables", () => {
			const result = validateCSource(`void Bms_Foo(void) { uint8 x; x = 1; }`)
			assert.ok(result.issues.some((i) => i.message.includes("uninitialized local variables")))
		})

		it("info naming convention for non-conforming functions", () => {
			const result = validateCSource(`void foo(void) { }`)
			assert.ok(result.issues.some((i) => i.message.includes("does not follow PascalCase_ModuleName_FunctionName")))
		})
	})

	describe("validateCHeader", () => {
		it("reports missing include guard", () => {
			const result = validateCHeader(`void f(void);`)
			assert.ok(result.issues.some((i) => i.message.includes("include guard")))
		})

		it("passes header with include guard", () => {
			const result = validateCHeader(`#ifndef F_H\n#define F_H\nvoid f(void);\n#endif`)
			assert.ok(!result.issues.some((i) => i.message.includes("include guard")))
		})

		it("flags dynamic allocation in header", () => {
			const result = validateCHeader(`#ifndef F_H\n#define F_H\nvoid* alloc(void);\n#endif`)
			assert.ok(!result.issues.some((i) => i.message.includes("Dynamic memory allocation")))
		})
	})

	describe("validateAutosarFile", () => {
		it("routes .arxml to ARXML validator", () => {
			const result = validateAutosarFile("Bms.arxml", `<AUTOSAR><SHORT-NAME>X</SHORT-NAME></AUTOSAR>`)
			assert.equal(result.issues.length, 0)
		})

		it("routes .h to header validator", () => {
			const result = validateAutosarFile("Bms.h", `#ifndef BMS_H\n#define BMS_H\nvoid f(void);\n#endif`)
			assert.equal(result.issues.length, 0)
		})

		it("routes .c to source validator", () => {
			const result = validateAutosarFile("Bms.c", `void Bms_Foo(void) { }`)
			assert.equal(result.issues.length, 0)
		})

		it("skips files larger than 1 MB", () => {
			const huge = "x".repeat(1024 * 1024 + 10)
			const result = validateAutosarFile("Bms.arxml", huge)
			assert.ok(result.issues.some((i) => i.message.includes("larger than 1 MB")))
		})
	})

	describe("formatValidationReport", () => {
		it("returns empty string for clean results", () => {
			const report = formatValidationReport("Bms.arxml", { issues: [] })
			assert.equal(report, "")
		})

		it("formats findings as markdown", () => {
			const report = formatValidationReport("Bms.arxml", {
				issues: [
					{ severity: "error", message: "Root element is not <AUTOSAR>." },
					{ severity: "warning", message: "No <SHORT-NAME> element found." },
				],
			})
			assert.ok(report.includes("BMS AUTOSAR validation for Bms.arxml"))
			assert.ok(report.includes("❌ Root element is not <AUTOSAR>."))
			assert.ok(report.includes("⚠️ No <SHORT-NAME> element found."))
		})
	})
})
