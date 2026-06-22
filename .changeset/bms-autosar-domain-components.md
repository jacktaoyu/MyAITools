---
"claude-dev": minor
---

feat: add BMS domain-specific AUTOSAR component templates

Expanded the BMS AUTOSAR code generator with six new `component_type` values tailored to battery management systems:

- `bms_csc` — Cell Supervision Circuit / AFE slave interface
- `bms_controller` — BMS mode manager, contactor/HV state machine
- `bms_balancer` — passive/active cell balancing
- `bms_thermal_manager` — thermal runaway protection, cooling/heating PWM
- `bms_charger` — AC/DC charger interface with CC/CV control
- `bms_diagnosis` — DTC manager / diagnostic service SWC

Each type ships with domain-appropriate default ports, runnables, C/H templates, and ARXML structure. The tool can now also infer a domain-specific component type from free-form requirements when `component_type` is omitted.
