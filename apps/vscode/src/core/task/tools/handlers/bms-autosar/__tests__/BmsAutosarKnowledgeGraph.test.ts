import { strict as assert } from "node:assert"
import { describe, it } from "mocha"
import { buildArxmlKnowledgeGraph, getRelatedNodes, rankByGraphProximity, searchGraphNodes } from "../BmsAutosarKnowledgeGraph"

const SAMPLE_ARXML = `<?xml version="1.0" encoding="UTF-8"?>
<AUTOSAR xmlns="http://autosar.org/schema/r4.0">
  <AR-PACKAGES>
    <AR-PACKAGE>
      <SHORT-NAME>BmsPackage</SHORT-NAME>
      <ELEMENTS>
        <APPLICATION-SW-COMPONENT-TYPE>
          <SHORT-NAME>BmsCellMonitor</SHORT-NAME>
          <PORTS>
            <P-PORT-PROTOTYPE>
              <SHORT-NAME>VoltageOut</SHORT-NAME>
              <PROVIDED-INTERFACE-TREF DEST="SENDER-RECEIVER-INTERFACE">/BmsPackage/BmsVoltageInterface</PROVIDED-INTERFACE-TREF>
            </P-PORT-PROTOTYPE>
          </PORTS>
          <INTERNAL-BEHAVIORS>
            <SWC-INTERNAL-BEHAVIOR>
              <RUNNABLES>
                <RUNNABLE-ENTITY>
                  <SHORT-NAME>BmsCellMonitor_ReadVoltage</SHORT-NAME>
                </RUNNABLE-ENTITY>
              </RUNNABLES>
            </SWC-INTERNAL-BEHAVIOR>
          </INTERNAL-BEHAVIORS>
        </APPLICATION-SW-COMPONENT-TYPE>
        <SENDER-RECEIVER-INTERFACE>
          <SHORT-NAME>BmsVoltageInterface</SHORT-NAME>
          <DATA-ELEMENTS>
            <VARIABLE-DATA-PROTOTYPE>
              <SHORT-NAME>CellVoltage</SHORT-NAME>
              <TYPE-TREF DEST="IMPLEMENTATION-DATA-TYPE">/BmsPackage/VoltageType</TYPE-TREF>
            </VARIABLE-DATA-PROTOTYPE>
          </DATA-ELEMENTS>
        </SENDER-RECEIVER-INTERFACE>
        <IMPLEMENTATION-DATA-TYPE>
          <SHORT-NAME>VoltageType</SHORT-NAME>
        </IMPLEMENTATION-DATA-TYPE>
      </ELEMENTS>
    </AR-PACKAGE>
  </AR-PACKAGES>
</AUTOSAR>
`

describe("BmsAutosarKnowledgeGraph", () => {
	it("builds nodes for components, ports, interfaces, data types and runnables", () => {
		const graph = buildArxmlKnowledgeGraph(SAMPLE_ARXML)
		assert.ok(graph.nodes.size > 0)
		const names = Array.from(graph.nodes.values()).map((n) => n.name)
		assert.ok(names.includes("BmsCellMonitor"))
		assert.ok(names.includes("VoltageOut"))
		assert.ok(names.includes("BmsVoltageInterface"))
		assert.ok(names.includes("VoltageType"))
		assert.ok(names.includes("BmsCellMonitor_ReadVoltage"))
	})

	it("creates contains edges from component to port", () => {
		const graph = buildArxmlKnowledgeGraph(SAMPLE_ARXML)
		const component = Array.from(graph.nodes.values()).find((n) => n.name === "BmsCellMonitor")
		const port = Array.from(graph.nodes.values()).find((n) => n.name === "VoltageOut")
		assert.ok(component)
		assert.ok(port)
		assert.ok(graph.edges.some((e) => e.source === component?.id && e.target === port?.id && e.relation === "contains"))
	})

	it("creates reference edges from port to interface", () => {
		const graph = buildArxmlKnowledgeGraph(SAMPLE_ARXML)
		const port = Array.from(graph.nodes.values()).find((n) => n.name === "VoltageOut")
		const iface = Array.from(graph.nodes.values()).find((n) => n.name === "BmsVoltageInterface")
		assert.ok(port)
		assert.ok(iface)
		assert.ok(graph.edges.some((e) => e.source === port?.id && e.target === iface?.id && e.relation === "provides"))
	})

	it("searches nodes by name", () => {
		const graph = buildArxmlKnowledgeGraph(SAMPLE_ARXML)
		const matches = searchGraphNodes(graph, "Voltage")
		assert.ok(matches.length >= 3)
	})

	it("finds related nodes within hops", () => {
		const graph = buildArxmlKnowledgeGraph(SAMPLE_ARXML)
		const component = Array.from(graph.nodes.values()).find((n) => n.name === "BmsCellMonitor")
		assert.ok(component)
		const related = getRelatedNodes(graph, component?.id, 2)
		assert.ok(related.size > 1)
		assert.ok(related.has(component?.id))
	})

	it("ranks entries by graph proximity", () => {
		const graph = buildArxmlKnowledgeGraph(SAMPLE_ARXML)
		const entries = [
			{ topic: "BmsCellMonitor runnable design", content: "describes BmsCellMonitor_ReadVoltage" },
			{ topic: "Voltage data type", content: "describes VoltageType" },
			{ topic: "Unrelated thermal management", content: "thermal runaway detection" },
		]
		const boosts = rankByGraphProximity(graph, entries, "BmsCellMonitor")
		assert.ok((boosts.get(0) ?? 0) > 0)
		assert.ok((boosts.get(1) ?? 0) > 0)
		assert.equal(boosts.get(2) ?? 0, 0)
	})
})
