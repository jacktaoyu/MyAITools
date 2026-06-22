---
"claude-dev": minor
---

feat: deepen BMS AUTOSAR webview wizard with presets, live preview, and batch config import/export

Enhanced the BMS AUTOSAR generation wizard in the webview:

- Added component presets for all 12 supported `component_type` values. Selecting a type or entering the details step auto-fills domain-appropriate component names, requirements, ports, runnables, and output format.
- Added a live prompt preview toggle on the details step so users can review the exact task prompt before generating.
- Added batch configuration import (JSON/YAML) and export (JSON/YAML) buttons, making it easy to reuse wizard configurations across tasks or workspaces.
- Improved inline form validation with per-field error messages and validation before proceeding to review.

Added `js-yaml` to `webview-ui` dependencies to support YAML import/export.
