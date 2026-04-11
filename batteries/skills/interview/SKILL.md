---
description: "Structured interview methodology — walk the decision tree one branch at a time, recommend answers, resolve from codebase when possible."
context: inline
---

# Interview Methodology

You are conducting a requirements interview for a feature spec. Your goal is to reach shared understanding on every decision that affects implementation — relentlessly, one question at a time.

## Context Check

Before starting, check if research findings already exist — the user may have provided a research file in their prompt or a prior research session may have produced one (check `planning/research/`). If findings exist, read them first and use them to seed your decision tree. If not, you're working from the GitHub issue and codebase alone.

## Core Protocol

### 1. Build the decision tree first

Before asking anything, identify the decision tree for this feature:
- What are the top-level decisions? (scope, data model, UX flow, integration points)
- Which decisions depend on others? (e.g., error handling depends on knowing the integration points)
- Order questions so dependencies resolve before dependents
- If research findings exist, many branches may already be partially resolved — focus on what's still open

### 2. Use AskUserQuestion

Use the **AskUserQuestion** tool for every question. This is how you talk to the user during interviews — not console output, not comments in code.

AskUserQuestion supports **1-4 questions per call**. Group related questions in a single call when they're on the same topic (e.g., "Scale?" + "Concurrency?" together). Keep unrelated questions separate so the user focuses on one topic at a time.

Each question needs:
- `question` — clear, specific, ends with "?"
- `header` — short chip label (max 12 chars, e.g., "Scale", "Auth")
- `options` — 2-4 concrete choices with descriptions (user can always pick "Other")
- `multiSelect: true` when choices aren't mutually exclusive (e.g., "Which test types?")

Put your **recommended option first** and add "(Recommended)" to its label. Use `preview` on options when showing code snippets or mockups the user needs to compare.

### 3. Recommend an answer

For every question, provide your recommended answer based on:
- What you learned from codebase research (P0)
- Existing patterns in the project
- Common best practices
- Prior answers in this interview

Format: state the question, then "**Recommended:** {your recommendation and why}". Give concrete options when possible.

### 4. Codebase-first resolution

If a question can be answered by exploring the codebase, **explore instead of asking**. Examples:
- "Which components exist for this?" — Glob/Grep for them, present findings
- "What's the current data model?" — read the schema, summarize it
- "How does the similar feature X work?" — read the code, explain it

Only ask the user when the answer requires a product decision, not a fact lookup.

### 5. Listen for implicit requirements

Users reveal constraints in passing ("oh and it needs to work offline", "we're migrating off that soon"). When you hear one:
- Pause the current branch
- Confirm: "I heard {implicit requirement} — is that a hard constraint?"
- If yes, add it to the decision tree (it may create new branches)

### 6. Confirm understanding before moving on

After each answer, restate what you understood in one sentence. Don't move to the next question until confirmed.

## Interview Categories

Work through these categories in order. Skip categories that don't apply (e.g., skip Design for backend-only features). Within each category, follow the decision tree — don't just go down the list linearly.

### Requirements
Resolve: problem statement -> happy path -> scope boundaries -> edge cases
- What user problem does this solve? What's the trigger?
- Walk me through the ideal success flow step by step
- What's explicitly NOT being built? (non-goals)
- Edge cases: empty state, first-time use, error recovery
- Scale: expected data volume? (affects pagination, caching, indexing)
- Concurrency: multiple users editing simultaneously?

### Architecture
Resolve: integration points -> data flow -> error handling -> performance
- Which existing systems/APIs does this touch?
- What's the data flow? (user action -> API -> DB -> response)
- How should errors surface? (inline, toast, error page, silent retry)
- Any latency or throughput constraints?
- Auth/permissions: who can do what?

### Testing
Resolve: happy path verification -> error scenarios -> test types
- What scenarios prove this feature works?
- What should fail gracefully? (validation, permissions, network)
- Unit, integration, or e2e? (pick based on what the feature actually needs)

### Design (UI features only)
Resolve: reference patterns -> layout -> components -> states
- Which existing page is most similar?
- What layout pattern fits? (list, detail, form, dashboard)
- Which existing components can be reused?
- Visual states: loading, empty, error, success?

## Completion

When all branches of the decision tree are resolved:
1. Produce a **Requirements Summary** — structured list of every decision made, grouped by category
2. Call out any **Open Risks** — decisions where the user was uncertain or where you see potential issues
3. Note **Codebase Findings** — key files, patterns, and constraints discovered during the interview

This summary becomes input to the spec-writing phase.

## Anti-patterns

- Asking yes/no questions when you need specifics
- Asking about things you could have looked up in the code
- Moving on without confirming understanding
- Asking all questions in one category before considering cross-category dependencies
- Not recommending — just presenting options without a suggestion
