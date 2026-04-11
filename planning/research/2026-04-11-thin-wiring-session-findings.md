---
date: 2026-04-11
topic: Template thin wiring extraction — dev1 templates
type: feature
status: in-progress
github_issue: 46
---

# Session Findings: Thin Wiring Extraction for Dev1 Templates

## What Was Done

### Templates rewritten (in /data/projects/baseplane-dev1/)
All 10 dev1 templates converted from instruction-heavy to thin wiring (skill + gate + $ref).
Files: `.kata/templates/{task,debug,research,implementation,verify,planning,auto-debug,housekeeping,vibegrid-smoke,freeform}.md`

### New project-specific skills created
- `.claude/skills/research/SKILL.md` — pipeline: outline → parallel deep-dive → synthesize → document (inspired by Deep-Research-skills github repo)
- `.claude/skills/auto-debug/SKILL.md` — triage, escalation criteria (10 triggers), per-bug fix loop, cluster detection
- `.claude/skills/housekeeping/SKILL.md` — dynamic doc discovery, layer alignment (5 layers), strict auto-fix criteria, issue label hygiene
- `.claude/skills/vibegrid-smoke/SKILL.md` — TEVS testing, ARIA selectors, coverage matrix, regression tracking

### steps.yaml expanded
`.kata/steps.yaml` — added 11 project-specific ceremony steps: fetch-bugs, run-tests, start-dev-server, read-verification-tools, label-issue, comment-issue, validate-spec, create-spec-file, run-review, load-housekeeping-ts, save-housekeeping-ts, check-fixes-made, approve-spec

### Template structure pattern (agreed)
Every template follows setup → work → close:
- **Setup**: classify/orient steps — $ref ceremony + short inline instructions for classification
- **Work**: `expansion: agent` + `skill: {methodology}` — agent creates tasks dynamically
- **Close**: $ref ceremony (commit-push, update-issue, etc.)

Static work phases only for truly known sequences (implementation subphase_pattern, planning spec-writing).

### Key design decisions
1. **Skills contain everything** — methodology AND tool patterns (agent spawning, Glob/Grep, WebSearch). Not just abstract methodology.
2. **Inline instructions are OK** for simple classification steps (e.g., "Infer research type from user message")
3. **Don't shoehorn skills** — if a step is simple enough that the title says it all, it doesn't need a skill reference
4. **Agent expansion for dynamic work** — if number of work items is discovered at runtime, use `expansion: agent`
5. **Research skill pipeline** — outline (1 task) → parallel deep-dive (N tasks) → synthesize (1 task) → document (1 task). Inspired by github.com/Weizhena/Deep-Research-skills

## What's NOT Working

### 1. Mode entry dumps raw YAML as instructions
`kata enter research` outputs the raw YAML frontmatter + JSON result. The agent sees a wall of YAML, not clear instructions. The enter command (`src/commands/enter.ts` line 73) calls `console.error(templateContent)` which dumps everything.

### 2. Rules injection is disconnected
- `batteries/kata.yaml` has per-mode `rules:` (commit 0278e53) — e.g., "You are a RESEARCHER"
- These get injected via `prime.ts` at SessionStart, NOT at mode entry
- Dev1's kata.yaml doesn't have `rules:` fields (generated before that commit)
- Even if rules existed, they'd show up at SessionStart, not when `kata enter` runs
- **Prime runs on SessionStart. Enter runs on mode entry. Rules need to be in BOTH or the right one.**

### 3. task_rules say "Never use TaskCreate" but expansion:agent needs it
The existing task_rules in kata.yaml say:
```
"Use TaskUpdate to mark tasks in_progress/completed. Never use TaskCreate."
```
But agent-expanded phases require TaskCreate. This contradicts. Needs resolution — either task_rules need updating or the expansion system needs to override them.

### 4. Template markdown body was the guidance — we removed it
The old templates had markdown bodies with:
- Role description ("You are an IMPLEMENTATION ORCHESTRATOR")
- Phase flow diagrams
- Anti-patterns ("Don't read 20 files inline")
- Protocol details (TEST protocol, REVIEW protocol)

We stripped all of it. The skills contain methodology, but the orchestration role/context has no home. kata.yaml `rules:` was supposed to replace this but:
- Rules are too short (1-2 sentences) to replace multi-paragraph guidance
- Rules inject at wrong time (SessionStart vs mode entry)
- Dev1 doesn't have them

### 5. No "rendered guidance" for the agent
The agent needs clear instructions at mode entry:
- What's your role?
- What are the phases and what do they mean?
- What skills will you use?
- What tasks are pre-created vs what do you create?

Currently it gets: raw YAML + JSON + maybe rules at SessionStart. No rendered human-readable guidance.

## Open Questions

1. **Where should orchestration context live?** Template body? kata.yaml rules? Rendered by enter command? A new mechanism?
2. **Should enter.ts render the template into readable instructions** instead of dumping raw YAML?
3. **How do rules get from batteries/kata.yaml into dev1?** Run `kata batteries --update`? But that only updates templates, not kata.yaml.
4. **Should the skill invocation happen at mode entry?** Currently skills are just `.claude/skills/` files that Claude reads when it decides to. There's no explicit "load this skill now" at mode entry.

## Files Changed (not committed)

In `/data/projects/baseplane-dev1/`:
```
Modified:
  .kata/templates/task.md
  .kata/templates/debug.md
  .kata/templates/research.md
  .kata/templates/implementation.md
  .kata/templates/verify.md
  .kata/templates/planning.md
  .kata/templates/auto-debug.md
  .kata/templates/housekeeping.md
  .kata/templates/vibegrid-smoke.md
  .kata/templates/freeform.md

New:
  .claude/skills/research/SKILL.md
  .claude/skills/auto-debug/SKILL.md
  .claude/skills/housekeeping/SKILL.md
  .claude/skills/vibegrid-smoke/SKILL.md
  .kata/steps.yaml (rewritten with project-specific steps)
```

In `/data/projects/kata-wm-42/`:
```
Symlink changed:
  /home/ubuntu/.local/bin/kata → /data/projects/kata-wm-42/kata (was → kata-wm)
```

## References
- [Deep-Research-skills](https://github.com/Weizhena/Deep-Research-skills) — two-phase research: outline + parallel deep-dive
- [Superpowers](https://github.com/obra/superpowers) — composable skill framework, brainstorming skill with 9-phase checklist
- Commit 0278e53 — per-mode rules in kata.yaml
- Commit e8de378 — template rewrite with stages, $ref, skills
