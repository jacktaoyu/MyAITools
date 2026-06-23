import { strict as assert } from "node:assert"
import { describe, it } from "mocha"
import { clearQualityReport, getQualityReport, upsertQualityReportFile } from "../BmsAutosarQualityReportStore"

describe("BmsAutosarQualityReportStore", () => {
	it("stores and retrieves a quality report", () => {
		clearQualityReport("/ws")
		upsertQualityReportFile("/ws", "BmsCellMonitor.c", [
			{ severity: "error", message: "malloc is not allowed", rule: "R21.3", line: 10 },
			{ severity: "warning", message: "multiple returns", rule: "R15.5" },
		])
		const report = getQualityReport("/ws")
		assert.ok(report)
		assert.equal(report?.files.length, 1)
		assert.equal(report?.summary.errors, 1)
		assert.equal(report?.summary.warnings, 1)
		assert.equal(report?.summary.total, 2)
	})

	it("replaces previous entries for the same file", () => {
		clearQualityReport("/ws")
		upsertQualityReportFile("/ws", "BmsCellMonitor.c", [{ severity: "error", message: "issue 1" }])
		upsertQualityReportFile("/ws", "BmsCellMonitor.c", [{ severity: "warning", message: "issue 2" }])
		const report = getQualityReport("/ws")
		assert.equal(report?.files.length, 1)
		assert.equal(report?.summary.errors, 0)
		assert.equal(report?.summary.warnings, 1)
	})

	it("aggregates issues across multiple files", () => {
		clearQualityReport("/ws")
		upsertQualityReportFile("/ws", "A.c", [{ severity: "error", message: "e1" }])
		upsertQualityReportFile("/ws", "B.c", [
			{ severity: "error", message: "e2" },
			{ severity: "info", message: "i1" },
		])
		const report = getQualityReport("/ws")
		assert.equal(report?.files.length, 2)
		assert.equal(report?.summary.errors, 2)
		assert.equal(report?.summary.info, 1)
		assert.equal(report?.summary.total, 3)
	})
})
