---
"claude-dev": minor
---

feat: BMS AUTOSAR batch generation, retrieval caching, validation, and webview wizard

Extended the BMS AUTOSAR generator with performance, usability, and quality improvements:

- Batch generation: `bms_autosar_generate` now accepts a `config_file` pointing to a JSON or YAML file with a `components` array, generating multiple component blueprints in one call.
- Template renderer: nested `{{#each}}` loops are now supported, enabling richer C/ARXML templates for the six BMS domain component types.
- Knowledge retrieval optimization: added an in-memory `mtime`-based cache for `templates.json` and workspace/global `knowledge.json`, plus memoization of query embeddings within the process.
- Validation enhancements: post-generation checks now flag empty `TYPE-TREF`/`SOFTWARE-COMPOSITION-TREF` references, magic numbers, uninitialized local variables, and non-conforming function names in generated C code.
- Webview wizard: a new guided form in the chat UI lets users configure component type, name, requirements, ports, runnables, and output format, then starts a task that invokes `bms_autosar_generate`.

Updated `BMS_AUTOSAR_CHANGES.md` to document the new iteration.
