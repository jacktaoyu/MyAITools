---
"claude-dev": minor
---

feat: BMS AUTOSAR knowledge base intelligence improvements

Enhanced the BMS AUTOSAR knowledge base with smarter management and retrieval:

- Eager embedding precomputation: when an OpenAI-compatible API key is configured, adding or updating a knowledge entry now computes and caches the embedding immediately in the background. This removes the first-retrieval latency penalty.
- Auto-tag suggestions: new knowledge entries without explicit tags now receive automatically suggested tags based on BMS/AUTOSAR keywords (e.g., `balancing`, `thermal`, `diagnosis`, `arxml`, `autosar`).
- Relevance threshold: `retrieveRelevantKnowledgeEntries` now supports an optional `scoreThreshold` and applies it to both embedding and TF-IDF results, preventing low-scoring, irrelevant entries from diluting the generated blueprint.
