---
"claude-dev": minor
---

feat: BMS AUTOSAR quality gates with auto-fix, enhanced ARXML validation, and C compile smoke test

Improved the reliability of generated BMS AUTOSAR artifacts:

- Added safe auto-fixes applied before saving: trailing whitespace removal, EOF newline normalization, and automatic include-guard insertion for `.h` files.
- Enhanced ARXML validation to detect duplicate sibling `SHORT-NAME` elements and dangling `TREF` references that do not resolve within the same file.
- Added an optional C compile smoke test using `gcc` or `clang -fsyntax-only`; runs automatically for generated `.c` files when a compiler is available.
- Quality gates are integrated into `WriteToFileToolHandler` and run after file saves; findings are appended to tool results without blocking writes.
