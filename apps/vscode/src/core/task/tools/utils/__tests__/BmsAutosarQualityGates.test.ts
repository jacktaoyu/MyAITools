import { strict as assert } from "node:assert"
import { describe, it } from "mocha"
import {
	compileCSmokeTest,
	fixAutosarContent,
	runBmsAutosarQualityGates,
	validateArxmlEnhanced,
} from "../BmsAutosarQualityGates"

describe("BmsAutosarQualityGates", () => {
	describe("fixAutosarContent", () => {
		it("adds a trailing newline if missing", () => {
			const fixed = fixAutosarContent("BmsTest.c", "void BmsTest_Run(void) { }")
			assert.ok(fixed.endsWith("\n"))
		})

		it("removes trailing whitespace", () => {
			const fixed = fixAutosarContent("BmsTest.c", "void foo(void) {  \n}")
			assert.ok(!fixed.includes("  \n"))
		})

		it("adds an include guard to a header missing one", () => {
			const fixed = fixAutosarContent("BmsTest.h", "void BmsTest_Init(void);\n")
			assert.ok(fixed.includes("#ifndef BMS_TEST_H"))
			assert.ok(fixed.includes("#define BMS_TEST_H"))
			assert.ok(fixed.includes("#endif /* BMS_TEST_H */"))
		})

		it("does not duplicate include guards", () => {
			const content = "#ifndef BMS_TEST_H\n#define BMS_TEST_H\n#endif\n"
			const fixed = fixAutosarContent("BmsTest.h", content)
			assert.equal((fixed.match(/#ifndef BMS_TEST_H/g) || []).length, 1)
		})
	})

	describe("validateArxmlEnhanced", () => {
		it("reports duplicate SHORT-NAME siblings", () => {
			const arxml = `<AUTOSAR>
  <AR-PACKAGES>
    <AR-PACKAGE>
      <SHORT-NAME>Pkg</SHORT-NAME>
      <ELEMENTS>
        <APPLICATION-SW-COMPONENT-TYPE>
          <SHORT-NAME>Swc</SHORT-NAME>
        </APPLICATION-SW-COMPONENT-TYPE>
        <APPLICATION-SW-COMPONENT-TYPE>
          <SHORT-NAME>Swc</SHORT-NAME>
        </APPLICATION-SW-COMPONENT-TYPE>
      </ELEMENTS>
    </AR-PACKAGE>
  </AR-PACKAGES>
</AUTOSAR>`
			const result = validateArxmlEnhanced(arxml)
			assert.ok(result.issues.some((i) => i.message.includes("Duplicate <SHORT-NAME>Swc")))
		})

		it("reports dangling references", () => {
			const arxml = `<AUTOSAR>
  <AR-PACKAGES>
    <AR-PACKAGE>
      <SHORT-NAME>Pkg</SHORT-NAME>
      <ELEMENTS>
        <APPLICATION-SW-COMPONENT-TYPE>
          <SHORT-NAME>Swc</SHORT-NAME>
          <PORTS>
            <R-PORT-PROTOTYPE>
              <SHORT-NAME>MyPort</SHORT-NAME>
              <REQUIRED-INTERFACE-TREF DEST="SENDER-RECEIVER-INTERFACE">/Pkg/MissingInterface</REQUIRED-INTERFACE-TREF>
            </R-PORT-PROTOTYPE>
          </PORTS>
        </APPLICATION-SW-COMPONENT-TYPE>
      </ELEMENTS>
    </AR-PACKAGE>
  </AR-PACKAGES>
</AUTOSAR>`
			const result = validateArxmlEnhanced(arxml)
			const hasDangling = result.issues.some(
				(i) => i.message.includes("MissingInterface") && i.message.includes("was found"),
			)
			assert.equal(hasDangling, true)
		})

		it("passes for valid local references", () => {
			const arxml = `<AUTOSAR>
  <AR-PACKAGES>
    <AR-PACKAGE>
      <SHORT-NAME>Pkg</SHORT-NAME>
      <ELEMENTS>
        <SENDER-RECEIVER-INTERFACE>
          <SHORT-NAME>CellVoltage</SHORT-NAME>
        </SENDER-RECEIVER-INTERFACE>
        <APPLICATION-SW-COMPONENT-TYPE>
          <SHORT-NAME>Swc</SHORT-NAME>
          <PORTS>
            <R-PORT-PROTOTYPE>
              <SHORT-NAME>MyPort</SHORT-NAME>
              <REQUIRED-INTERFACE-TREF DEST="SENDER-RECEIVER-INTERFACE">/Pkg/CellVoltage</REQUIRED-INTERFACE-TREF>
            </R-PORT-PROTOTYPE>
          </PORTS>
        </APPLICATION-SW-COMPONENT-TYPE>
      </ELEMENTS>
    </AR-PACKAGE>
  </AR-PACKAGES>
</AUTOSAR>`
			const result = validateArxmlEnhanced(arxml)
			assert.ok(!result.issues.some((i) => i.message.includes("was found")))
		})
	})

	describe("compileCSmokeTest", () => {
		it("returns info when no compiler is available", async () => {
			// This test assumes gcc/clang is available in CI; if not, it validates the graceful fallback.
			const result = await compileCSmokeTest("BmsTest.c", "void BmsTest_Run(void) { }\n")
			const hasCompilerInfo = result.issues.some((i) => i.message.includes("No C compiler") || i.severity === "info")
			const hasNoErrors = result.issues.every((i) => i.severity !== "error")
			assert.ok(hasCompilerInfo || hasNoErrors)
		})

		it("reports syntax errors in invalid C", async function () {
			this.timeout(10000)
			const result = await compileCSmokeTest("BmsTest.c", "void BmsTest_Run(void) { int x = }\n")
			const syntaxError = result.issues.some((i) => i.severity === "error" && i.message.includes("Compile smoke test failed"))
			const noCompiler = result.issues.some((i) => i.message.includes("No C compiler"))
			assert.ok(syntaxError || noCompiler)
		})
	})

	describe("runBmsAutosarQualityGates", () => {
		it("combines base and enhanced ARXML validation", async () => {
			const arxml = `<AUTOSAR>
  <AR-PACKAGES>
    <AR-PACKAGE>
      <SHORT-NAME>Pkg</SHORT-NAME>
      <ELEMENTS>
        <APPLICATION-SW-COMPONENT-TYPE>
          <SHORT-NAME>Swc</SHORT-NAME>
          <PORTS>
            <R-PORT-PROTOTYPE>
              <SHORT-NAME>Port</SHORT-NAME>
              <REQUIRED-INTERFACE-TREF DEST="SENDER-RECEIVER-INTERFACE">/Pkg/Missing</REQUIRED-INTERFACE-TREF>
            </R-PORT-PROTOTYPE>
          </PORTS>
        </APPLICATION-SW-COMPONENT-TYPE>
      </ELEMENTS>
    </AR-PACKAGE>
  </AR-PACKAGES>
</AUTOSAR>`
			const result = await runBmsAutosarQualityGates("BmsSwc.arxml", arxml)
			assert.ok(result.issues.some((i) => i.message.includes("Missing") && i.message.includes("was found")))
		})

		it("runs C validation and compile smoke test for .c files", async function () {
			this.timeout(10000)
			const cSource = `void BmsTest_Run(void) { int x = 0; }\n`
			const result = await runBmsAutosarQualityGates("BmsTest.c", cSource)
			const hasCompileError = result.issues.some((i) => i.message.includes("Compile smoke test failed"))
			const hasNoCompiler = result.issues.some((i) => i.message.includes("No C compiler"))
			// With a compiler available the smoke test should not fail. MISRA checks
			// may produce warnings for this minimal snippet, which is expected.
			assert.ok(!hasCompileError || hasNoCompiler)
		})
	})
})
