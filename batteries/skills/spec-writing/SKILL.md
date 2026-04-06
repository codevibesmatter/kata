---
name: spec-writing
description: "Use when writing feature specifications. Structure behaviors, phases, and verification plans."
---

# Spec Writing Methodology

## Spec Structure

Every spec must include these sections:

### Overview
1-3 sentences: what problem this solves, for whom, and why now.

### Feature Behaviors
For each behavior:
- **ID:** kebab-case identifier
- **Trigger:** what causes this behavior
- **Expected:** what should happen
- **Verify:** how to confirm it works
- **UI Layer:** what the user sees
- **API Layer:** endpoints, input, output
- **Data Layer:** schema changes

### Non-Goals
Explicit list of what is NOT being built.

### Implementation Phases
2-5 phases with concrete tasks per phase. Each phase gets test_cases.

### Verification Plan
Concrete, executable steps a fresh agent can run:
- Every step must be a literal command or URL
- Include expected response bodies, status codes, or visible UI state
- "Verify that it works" is NOT a valid step

### Implementation Hints
1. Key Imports table — exact package subpath exports
2. Code Patterns — 2-5 copy-pasteable snippets
3. Gotchas — subpath export quirks, peer deps, TS config
4. Reference Doc URLs with descriptions

## Rules
- No TBD/TODO/placeholder text
- File paths must reference real files
- Every behavior must have all Core fields filled
- Verification Plan must have executable steps
