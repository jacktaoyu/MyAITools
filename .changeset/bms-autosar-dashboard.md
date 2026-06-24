---
"claude-dev": minor
---

feat(bms-autosar): Phase 4 unified dashboard and UX polish

- Add a unified BMS AUTOSAR Dashboard with quick actions and live metrics (quality issues, knowledge entries, compile profiles, template count).
- Surface the dashboard via the BMS AUTOSAR dropdown in ChatTextArea and a new VS Code command.
- Replace `alert()` notifications in quality UIs and the knowledge graph with inline toast notices using a shared `useBmsAutosarNotice` hook.
