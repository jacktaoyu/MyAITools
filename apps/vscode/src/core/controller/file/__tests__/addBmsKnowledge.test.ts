import { strict as assert } from "node:assert";
import { describe, it } from "mocha";
import { extractShortName } from "../addBmsKnowledge";

describe("addBmsKnowledge", () => {
	describe("extractShortName", () => {
		it("extracts the first SHORT-NAME from ARXML", () => {
			const xml = `<?xml version="1.0"?>
<AUTOSAR>
  <AR-PACKAGE>
    <SHORT-NAME>BmsCellMonitor</SHORT-NAME>
    <ELEMENTS>
      <APPLICATION-SW-COMPONENT-TYPE>
        <SHORT-NAME>InnerName</SHORT-NAME>
      </APPLICATION-SW-COMPONENT-TYPE>
    </ELEMENTS>
  </AR-PACKAGE>
</AUTOSAR>`;
			assert.equal(extractShortName(xml), "BmsCellMonitor");
		});

		it("returns undefined when no SHORT-NAME exists", () => {
			assert.equal(extractShortName("<AUTOSAR></AUTOSAR>"), undefined);
		});

		it("trims whitespace around SHORT-NAME", () => {
			assert.equal(
				extractShortName("<SHORT-NAME>  BmsEcu  </SHORT-NAME>"),
				"BmsEcu",
			);
		});
	});
});
