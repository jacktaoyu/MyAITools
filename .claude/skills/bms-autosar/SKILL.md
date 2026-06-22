---
name: bms-autosar
description: Generate AUTOSAR Classic Platform software artifacts for Battery Management Systems (BMS), including SWCs, BSW modules, RTE interfaces, ARXML descriptors, and MISRA-compliant C code.
---

# BMS AUTOSAR Code Generation Skill

Use this skill whenever the user asks to generate, review, or refactor AUTOSAR code/ARXML for battery management systems (BMS).

## Domain Context

### BMS Core Concepts
- **Battery Cell**: The smallest electrochemical unit (e.g., NMC, LFP).
- **Module / Submodule**: A group of cells monitored by a single cell monitoring IC (CSC).
- **Pack**: The complete battery system containing modules, contactors, pre-charge, current sensor, and thermal sensors.
- **SOC (State of Charge)**: Remaining capacity [%].
- **SOH (State of Health)**: Battery degradation [% of initial capacity].
- **SOP (State of Power)**: Allowed charge/discharge power [W].
- **SOE (State of Energy)**: Remaining energy [Wh].
- **Cell Balancing**: Passive (resistor) or active (capacitor/inductor) balancing.
- **Thermal Management**: Heating/cooling control, fan/pump PWM, temperature thresholds.
- **HV Safety**: Interlock, insulation monitoring, contactor control, pre-charge sequence, crash detection.
- **Diagnostics**: DTCs per UDS, severity classes, debouncing (UDS DTC status byte).

### AUTOSAR Classic Architecture
- **ASW (Application Software)**: Contains Software Components (SWC) with runnables and ports.
- **RTE (Runtime Environment)**: Generated interface layer; ports are Sender/Receiver (S/R), Client/Server (C/S), or NvData.
- **BSW (Basic Software)**:
  - **Services Layer**: NVRAM Manager (NvM), Diagnostic Event Manager (DEM), Diagnostic Communication Manager (DCM), Communication Manager (ComM), ECU State Manager (EcuM).
  - **ECU Abstraction Layer (ECUAL)**: IoHwAb, CanIf, CanTp, LinIf.
  - **Microcontroller Driver Layer (MCAL)**: Port, Dio, Adc, Pwm, Spi, Can, Wdg, Gpt.
- **OS**: OSEK/AUTOSAR OS with tasks, events, alarms, and resources.

## Code Generation Rules

### 1. Naming Conventions
- **Files**: `Bsw_<Module>_<File>.c`, `Rte_<Swc>_<Port>.h`, `<Swc>.c`, `<Swc>.h`
- **C Functions**: `ModuleName_FunctionName` (PascalCase module, camelCase function).
- **Runnable names**: `<Swc>_<Runnable>` (e.g., `BmsStateEstimator_Run10ms`).
- **Port interfaces**: `P_<Sender>_to_<Receiver>` or descriptive names.
- **Data types**: Use AUTOSAR primitive types (`uint8`, `uint16`, `sint16`, `float32`) and application data types (`Adc_VoltageType`, `Temperature_DegCType`).
- **Macros**: `MODULE_NAME_MACRO_NAME` uppercase with underscores.

### 2. C Code Style (MISRA C:2012 aligned)
- No dynamic memory allocation after initialization.
- All functions have a single exit point.
- Initialize all automatic variables at definition.
- Use `const` for pointer parameters that are read-only.
- Avoid magic numbers; define as `#define` or `static const`.
- Cyclomatic complexity target ≤ 10 per function.
- Each `.c` file starts with a standard file header containing module name, version, author, and copyright.

### 3. SWC Template
Each SWC must include:
- `SwComponentType` definition (in ARXML).
- InternalBehavior with `runnables`, `events` (TimingEvent / DataReceivedEvent / OperationInvokedEvent).
- `PortPrototype` definitions (PPortPrototype / RPortPrototype).
- Implementation `.c` and `.h` files.
- RTE API usage: `Rte_Read_<Port>_<Element>()`, `Rte_Write_<Port>_<Element>()`, `Rte_Call_<Port>_<Operation>()`, `Rte_IWrite_<Port>_<Element>()`.

### 4. BSW Module Template
Each BSW module must include:
- `*_Cfg.h` / `*_Lcfg.c` / `*_PBcfg.c` for configuration.
- `*.h` public API header.
- `*.c` implementation with init function (`<Module>_Init`), deinit, and main function (`<Module>_MainFunction`).
- SchM calls for exclusive areas if needed.
- DET error reporting (`Det_ReportError`) for development error tracing.

### 5. RTE Interface Design
- Prefer **Sender/Receiver** interfaces for periodic sensor data.
- Prefer **Client/Server** interfaces for request/response operations (e.g., balance command).
- Use **NvData** interfaces for non-volatile data (e.g., learned SOH, cycle count).
- Define explicit data types and invalid values (e.g., `0xFFFF` for invalid temperature).

### 6. ARXML Patterns
- Use AUTOSAR schema 4.x (`AUTOSAR_00049_STRICT` or equivalent).
- Provide `SHORT-NAME` for every package, element, and reference.
- Reference existing data types via `DEST="APPLICATION-PRIMITIVE-DATA-TYPE"`.
- Keep package structure: `/MICROSAR/<EcucModuleConfiguration>`, `/Application/<SwComponentType>`, `/Interfaces/<SenderReceiverInterface>`.

## Common BMS SWC Catalog

| SWC Name | Responsibility | Typical Runnables |
|---|---|---|
| BmsController | Mode management, contactor control, HV state machine | `Run10ms` |
| CellMonitor | Read cell voltages/temperatures from CSC | `Run100ms` |
| StateEstimator | SOC/SOH/SOP estimation | `Run100ms`, `Run1s` |
| ThermalManager | Thermal runaway protection, cooling/heating | `Run100ms` |
| Diagnosis | DTC management, fault debouncing | `Run10ms`, `Event` |
| Balancer | Passive/active cell balancing | `Run1s` |
| ChargerInterface | AC/DC charging control | `Run100ms` |
| V2xInterface | V2L/V2G interface (if applicable) | `Run100ms` |

## Built-in BMS Domain Component Types

In addition to generic `swc` and `service`, the `bms_autosar_generate` tool understands the following BMS-specific `component_type` values. Each comes with domain-appropriate default ports, runnables, and AUTOSAR templates:

| component_type | Description | Default Ports | Default Runnables |
|---|---|---|---|
| `bms_csc` | Cell Supervision Circuit / AFE slave interface | `CellVoltage_Slave` (R), `CellTemperature_Slave` (R), `CellVoltageBus` (P) | `Run10ms` |
| `bms_controller` | BMS mode manager, contactor/HV state machine | `PackCurrent` (R), `HvRequest` (R), `ContactorControl` (P), `PreChargeStatus` (P), `BmsMode` (P) | `Run10ms`, `Run100ms` |
| `bms_balancer` | Passive/active cell balancing | `CellVoltage` (R), `BalanceCommand` (P), `BalanceStatus` (P) | `Run1s` |
| `bms_thermal_manager` | Thermal runaway protection, cooling/heating PWM | `CellTemperature` (R), `CoolingPwm` (P), `HeatingPwm` (P), `ThermalRunaway` (P) | `Run100ms` |
| `bms_charger` | AC/DC charger interface, CC/CV control | `ChargerVoltage` (R), `ChargerCurrent` (R), `ChargeRequest` (P), `ChargeStatus` (P) | `Run100ms` |
| `bms_diagnosis` | DTC manager / diagnostic service SWC | `DiagnosticEvent` (P), `DiagnosticRequest` (R-C/S), `FaultStatus` (P) | `Run10ms`, `EventHandler` |

If `component_type` is omitted, the tool attempts to infer a domain-specific type from the `requirements` text (e.g., "create a thermal manager" -> `bms_thermal_manager`).

## Example Output Structure

When generating a BMS SWC, produce at minimum:
1. `<Swc>.h` — public header with RTE include guards.
2. `<Swc>.c` — runnable implementations.
3. `<Swc>.arxml` — ARXML descriptor.
4. `<Swc>_Types.arxml` — implementation data types and interfaces.
5. `Rte_<Swc>.h` — expected RTE API stubs (optional, for review).

### Example: BMS Thermal Manager

```xml
<bms_autosar_generate>
<component_type>bms_thermal_manager</component_type>
<component_name>BmsThermalManager</component_name>
<output_format>both</output_format>
</bms_autosar_generate>
```

### Example: BMS Diagnosis (component type inferred from requirements)

```xml
<bms_autosar_generate>
<component_name>BmsDiagnosis</component_name>
<requirements>Manage DTCs, debounce faults, and handle diagnostic requests from DCM.</requirements>
<output_format>both</output_format>
</bms_autosar_generate>
```

## Validation Checklist

Before declaring completion, verify:
- [ ] Generated C code compiles with a standard AUTOSAR toolchain (e.g., Vector DaVinci, EB tresos).
- [ ] ARXML is schema-valid and all references resolve.
- [ ] RTE calls use correct port/interface element names.
- [ ] MISRA C:2012 rules are respected (no obvious violations).
- [ ] BSW modules follow AUTOSAR SWS naming and init pattern.

## Extending the Knowledge Base

Users can add their own project-specific BMS AUTOSAR knowledge at runtime. This is useful for:

- Project-specific naming conventions
- Customer-specific ARXML patterns
- OEM-specific BSW configuration rules
- Custom cell chemistry parameters
- Internal coding standards

To add knowledge, use the `bms_autosar_knowledge` tool:

```xml
<bms_autosar_knowledge>
<action>add</action>
<topic>Project naming convention</topic>
<content>All BMS SWC files must use the "Bms" prefix and be placed under /Application/SWCs. Runnables must end with the period in milliseconds (e.g., Run10ms, Run100ms).</content>
<scope>workspace</scope>
</bms_autosar_knowledge>
```

Supported actions:
- `add`: Create or update an entry.
- `list`: Show all stored entry topics.
- `get`: Retrieve a specific entry by topic.
- `delete`: Remove a specific entry by topic.

Scope:
- `workspace`: Stored in `<project>/.cline/bms-autosar/knowledge.json`, tied to the current project.
- `global`: Stored in `~/.cline/bms-autosar/knowledge.json`, available across all projects.

Importing from files:
- The `add` action supports a `file_path` parameter.
- Supported formats: `.xlsx`, `.docx`, `.pdf`, `.csv`, `.txt`, `.md`, `.ipynb`.
- The file must be inside the current workspace (or `~/.cline/bms-autosar/` when `scope` is `global`).
- Extracted text is merged with any `content` you provide.

Example importing from an Excel file:

```xml
<bms_autosar_knowledge>
<action>add</action>
<topic>NXP S32K BMS pin mapping</topic>
<file_path>docs/bms_pin_mapping.xlsx</file_path>
<scope>workspace</scope>
</bms_autosar_knowledge>
```

Graphical file import:

- The chat input toolbar includes a book icon button "Add BMS Knowledge from File".
- Clicking it opens a file picker for `.xlsx`, `.xls`, `.docx`, `.pdf`, `.csv`, `.txt`, and `.md`.
- After selecting a file, enter a short topic; the file text is extracted and saved to the workspace knowledge base.
- This is equivalent to calling `bms_autosar_knowledge` with `action=add` and the selected `file_path`.
- A toast notice appears at the bottom of the webview to confirm success or report errors.

Managing entries:

- Next to the add button is a list icon "Manage BMS Knowledge".
- Clicking it opens a dialog showing all workspace knowledge entries with their last updated time.
- Use the trash icon next to an entry to delete it from the workspace knowledge base.

When `bms_autosar_generate` is called, it automatically loads workspace and global entries and includes the relevant ones in the generation blueprint.

## User Interaction Guidance

1. When the user requests BMS AUTOSAR generation, ask clarifying questions only when component type, name, or interfaces are missing.
2. If the user says "generate BMS StateEstimator SWC", directly call `bms_autosar_generate` with `component_type="swc"` and `component_name="BmsStateEstimator"`.
3. If requirements are vague, propose a sensible default port/runnable set and let the user confirm.
4. Always check the relevant knowledge base entries returned by `bms_autosar_generate` and respect project-specific conventions found there.
5. Always explain generated design decisions briefly in natural language after producing artifacts.
