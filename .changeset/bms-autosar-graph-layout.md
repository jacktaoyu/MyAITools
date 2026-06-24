---
"claude-dev": patch
---

fix(bms-autosar): improve ARXML knowledge graph layout and interaction

- Replace the simple force layout with a collision-aware force-directed layout to reduce node overlap.
- Add mouse wheel zoom and drag pan to the graph SVG.
- Add zoom in / zoom out / reset view buttons.
- Move node labels below circles and truncate them for better readability.
