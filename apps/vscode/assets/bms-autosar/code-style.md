# BMS AUTOSAR C Code Style Guide

This guide defines the coding style used when generating AUTOSAR Classic Platform C code for Battery Management Systems (BMS).

## General Principles

- Target **MISRA C:2012** compliance.
- Follow **AUTOSAR SWS** naming conventions.
- Prefer static allocation; no `malloc`/`free` after initialization.
- Keep functions focused; target cyclomatic complexity ≤ 10.

## Naming Conventions

| Item | Convention | Example |
|------|------------|---------|
| File | `PascalCase` with module prefix | `BmsStateEstimator.c` |
| Function | `ModuleName_verbNoun` | `BmsStateEstimator_Init` |
| Runnable | `<Swc>_<Name>` | `BmsStateEstimator_Run100ms` |
| Macro | `UPPER_CASE` | `BMS_STATE_ESTIMATOR_OK` |
| Enum | Type `ModuleName_TypeName`, constants `MODULE_NAME_VALUE` | `Bms_ErrorType`, `BMS_ERROR_NONE` |
| typedef | Suffix `Type` | `Adc_VoltageType` |
| Local variable | `camelCase` | `cellVoltage` |
| Global variable | `g<ModuleName><Name>` | `gBmsStateEstimatorContext` |
| Pointer parameter (read-only) | `const` qualifier | `const Adc_VoltageType *voltages` |

## File Layout

```c
/**
 * \file BmsStateEstimator.c
 * \brief BMS SOC/SOH/SOP estimation software component.
 * \version 1.0.0
 * \copyright Copyright (c) 2026 Example Corp.
 */

/* Includes */
#include "BmsStateEstimator.h"
#include "Rte_BmsStateEstimator.h"
#include "Det.h"

/* Macro definitions */
#define BMS_STATE_ESTIMATOR_EKF_COV_MAX (10000.0f)

/* Type definitions */
typedef struct {
    float32 soc;
    float32 soh;
    float32 sopCharge;
    float32 sopDischarge;
} BmsStateEstimator_StateType;

/* Global variables */
static BmsStateEstimator_StateType gBmsStateEstimatorState = {0};

/* Function prototypes (static) */
static Std_ReturnType BmsStateEstimator_ValidateInputs(const Adc_VoltageType *voltages, uint16 numCells);

/* Function definitions */
#define BMS_STATE_ESTIMATOR_START_SEC_CODE
#include "MemMap.h"

Std_ReturnType BmsStateEstimator_Init(void)
{
    gBmsStateEstimatorState.soc = 0.0f;
    gBmsStateEstimatorState.soh = 100.0f;
    gBmsStateEstimatorState.sopCharge = 0.0f;
    gBmsStateEstimatorState.sopDischarge = 0.0f;

    return E_OK;
}

#define BMS_STATE_ESTIMATOR_STOP_SEC_CODE
#include "MemMap.h"
```

## MISRA C:2012 Highlights

- Rule 15.5: Single exit point per function.
- Rule 17.2: No recursion.
- Rule 21.3: No use of `malloc`, `calloc`, `realloc`, or `free`.
- Initialize all automatic variables at point of definition.
- Use explicit `u` suffix for unsigned literals.
- Avoid implicit conversions; use explicit casts when necessary.

## RTE API Usage

```c
Adc_VoltageType cellVoltage = 0u;
Std_ReturnType status = Rte_Read_CellVoltage_Voltage(&cellVoltage);

if (status == E_OK) {
    /* process value */
}
```

For provided ports:

```c
Percent_Type soc = 95u;
(void)Rte_Write_StateOfCharge_Value(soc);
```

## ARXML References

- Use `DEST` attributes that match the actual element type.
- Keep `SHORT-NAME` values stable because RTE generation depends on them.
- Place shared data types under `/Application/DataTypes`.
- Place SWCs under `/Application/SWCs`.
- Place interfaces under `/Application/Interfaces`.
