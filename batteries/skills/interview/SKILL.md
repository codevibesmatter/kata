---
description: "Structured interview methodology — ask one question at a time, listen for implicit requirements, confirm understanding."
context: inline
---

# Interview Methodology

## Principles

- **Ask one question at a time** — don't overwhelm with multi-part questions
- **Listen for implicit requirements** — users often mention constraints in passing
- **Confirm understanding** — restate what you heard before moving on
- **Document answers immediately** — don't rely on memory

## Interview Categories

### Requirements
Focus on: problem statement, happy path, scope boundaries, edge cases.
- What problem does this solve?
- Walk me through the happy path
- What's explicitly out of scope?
- Edge cases: empty state, scale, concurrency?

### Architecture
Focus on: integration points, error handling, performance.
- Which existing systems does this touch?
- How should errors be handled?
- Any performance requirements or constraints?

### Testing
Focus on: verification strategy, test types, coverage.
- What scenarios prove this works?
- What error scenarios matter most?
- Unit, integration, or e2e tests?

### Design (UI only)
Focus on: reference pages, layout patterns, components.
- Any existing pages to reference?
- What layout pattern applies?
- Which existing components can be reused?
