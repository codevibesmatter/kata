---
date: 2026-04-05
topic: Skills-based workflows vs mode/task systems — superpowers analysis
status: complete
github_issue: null
---

# Research: Skills-Based Workflows vs Mode/Task Systems

## Context

Explored the [obra/superpowers](https://github.com/obra/superpowers) project (93K+ GitHub stars) — a pure skills-based workflow system for AI coding agents — and researched public discourse on skills vs modes for AI assistant workflow management. Goal: identify what kata-wm should adopt while preserving the value of its mode/task/hook architecture.

## Questions Explored

1. How does superpowers structure its skills-based workflow?
2. What architectural patterns are cleaner than kata-wm's current approach?
3. What should kata-wm adopt vs. keep from its existing system?
4. What does public discourse say about skills-based AI workflows?

## Findings

### Superpowers Architecture

**Core design**: Each skill is a `SKILL.md` markdown file with YAML frontmatter (`name` + `description`), auto-discovered by filesystem convention (`skills/skill-name/SKILL.md`). No centralized router — a bootstrap meta-skill ("using-superpowers") is injected at session start, instructing the agent to check skills before every response.

**Key patterns**:
- **Filesystem-convention discovery** — no registration step; drop a file, it's live
- **< 500 line rule** — SKILL.md stays lean; reference material in separate files
- **Prose-based chaining** — skills reference each other via markdown links, not dependency graphs
- **Disk artifacts as state** — plans/specs written to `docs/superpowers/`, downstream skills read them
- **Five implicit phases** (Design → Plan → Execute → Test → Complete) encoded in skill prose, not enforced
- **Subagent-driven execution** — fresh subagent per task, mandatory since v5
- **Adversarial review loops** — subagents validate specs/plans before execution

**Evolution (v4→v5)**:
- v4: Condensed overlapping skills after discovering Claude increasingly "wings it without actually reading the skill." Skill descriptions refocused on *when* to use, not *what* they do.
- v5: Deprecated explicit slash commands for natural language triggering. Made subagent-driven development mandatory.

**Known limitations**:
- Claude often claims it will use a skill without actually reading it (especially with Opus 4.5)
- Token-heavy: 50K+ tokens per subagent across 5 subtasks
- No benchmarks proving skills improve output vs baseline
- No enforcement: nothing prevents skipping phases or ignoring skills
- Cross-cutting skills (e.g., "collision-zone-thinking") may be too broad

### Community Consensus: Three Enforcement Tiers

The community has converged on a clear hierarchy:

| Tier | Mechanism | Enforcement | Bypass Risk |
|------|-----------|-------------|-------------|
| Soft | CLAUDE.md / project rules | Context-based | High — compacted away or ignored |
| Medium | Skills (SKILL.md) | Prompt-based | Medium — agent may skip or "wing it" |
| Hard | Hooks (settings.json) | Deterministic code | None — fires regardless of context |

**Key voices**:

- **Shrivu Shankar** ([blog.sshh.io](https://blog.sshh.io/p/how-i-use-every-claude-code-feature)): "Rules live in context and can be compressed away, while hooks live in settings.json and fire every time, regardless of context state."
- **Nick Tune** ([medium.com](https://medium.com/nick-tune-tech-strategy-blog/minimalist-claude-code-task-management-workflow-7b7bdcbc4cc1)): "I couldn't get it to work with just a written description. So I decided to try the state machine approach and that made a big difference." State machines > prose.
- **HN critics** on superpowers: "Skill documents read like what you'd get prompting an LLM to write markdown describing how to do X" — skeptical that feeding LLM-generated summaries back improves results. Called for "A/B testing, quantifiable metrics, statistical significance."

### What kata-wm Has That Skills-Only Systems Don't

1. **Deterministic gate enforcement** — PreToolUse hooks (mode-gate, task-deps, task-evidence) cannot be bypassed by the agent
2. **Validated state machine** — Zod-schema SessionState with phase progression, not prose expectations
3. **Task dependency chains** — blocked tasks literally cannot start until dependencies resolve
4. **Stop condition enforcement** — hooks block session exit while work is incomplete
5. **Session tracking** — workflow IDs, audit trail, reproducibility across conversations

### Where Superpowers Is Architecturally Cleaner

1. **Composability** — skills are self-contained, independently shareable, no monolithic template
2. **Progressive disclosure** — SKILL.md < 500 lines; reference material linked separately
3. **Natural language triggering** — no explicit `kata enter` ceremony for obvious intents
4. **Cross-platform** — works on Claude Code, Cursor, Gemini CLI, Codex, OpenCode
5. **Community contribution model** — low friction to add/modify a single skill

### Notable Projects in the Space

| Project | Approach | Key Insight |
|---------|----------|-------------|
| [obra/superpowers](https://github.com/obra/superpowers) | Pure skills (93K stars) | Skills must focus on *when* not *what*; agent compliance is unreliable |
| [vinicius91carvalho/.claude](https://github.com/vinicius91carvalho/.claude) | Hybrid hooks+skills | "Modules pass in isolation but integration seams break" — enforce at boundaries |
| [Claude-Command-Suite](https://github.com/qdhenry/Claude-Command-Suite) | 57 slash commands | Heavy command library; explicit invocation over auto-detection |
| [awesome-claude-code](https://github.com/hesreallyhim/awesome-claude-code) | Curated list | Community catalog of skills, hooks, commands, and orchestrators |

## Recommendations

### The Hybrid Thesis

**Modes are the orchestrator. Skills are the executor.**

kata-wm's modes own the DAG (what must happen, in what order, with what gates). Skills own the nodes (how each step is performed). This maps cleanly:

```
Mode template (outer loop)          Skill content (inner loop)
─────────────────────────           ─────────────────────────
Phase ordering & dependencies       How to perform each phase step
Gate enforcement (hooks)            Domain expertise & methodology
Stop conditions                     Best practices & anti-patterns
Session state & tracking            Subagent dispatch patterns
```

### What to Adopt

| Pattern | From | How to Apply in kata-wm |
|---------|------|-------------------------|
| Skills as phase executors | Superpowers | Template phases reference skills; skills contain the "how" |
| Filesystem discovery | Superpowers | `.kata/skills/` or `.claude/skills/` auto-discovered |
| < 500 line content rule | Superpowers | Keep skill/template content lean; link reference material |
| Smoother intent detection | Superpowers v5 | Enhance existing `user-prompt` hook to auto-enter obvious modes |
| Mandatory subagent execution | Superpowers v5 | Extend verify-run pattern to implementation phases |
| Adversarial review loops | Superpowers v5 | Subagent validates specs/plans before gate progression |

### What to Keep

| Pattern | Why |
|---------|-----|
| Hook-based gate enforcement | Only reliable enforcement tier per community consensus |
| Zod-validated state machine | State machines > prose instructions (Nick Tune finding) |
| Task dependency chains | Prevents phase skipping — the exact problem superpowers can't solve |
| Stop condition hooks | No skills equivalent exists |
| Session/workflow tracking | Audit trail and reproducibility |

### What to Avoid

| Pattern | Why |
|---------|-----|
| Pure skills without enforcement | Agent compliance is unreliable — superpowers' own evolution proves this |
| Persuasion-based compliance | HN consensus: "voodoo" without benchmarks |
| Monolithic skill content | > 500 lines gets skimmed or ignored |
| Auto-triggering without user confirmation | Risk of wrong mode entry; current suggest-then-enter is safer |

## Open Questions

1. **Skill packaging**: Should skills be in-repo (`.kata/skills/`) or bundled in the npm package like batteries templates?
2. **Cross-mode skills**: Some skills (TDD, code review, git worktrees) apply across modes — how to share without duplication?
3. **Subagent cost**: Mandatory subagent execution is token-expensive — should it be configurable per project?
4. **Benchmarking**: How to measure whether skills actually improve agent output quality?

## Next Steps

- Consider a planning issue to prototype the hybrid approach: mode templates reference skills, skills provide phase execution guidance
- Evaluate whether existing template phase instructions could be extracted into standalone skills
- Look at `.claude/skills/` as the standard location (aligns with Claude Code native skill discovery)

## Sources

- [Superpowers GitHub](https://github.com/obra/superpowers)
- [Superpowers: How I'm using coding agents (Oct 2025)](https://blog.fsck.com/2025/10/09/superpowers/)
- [Superpowers 4 (Dec 2025)](https://blog.fsck.com/2025/12/18/superpowers-4/)
- [Superpowers 5 (Mar 2026)](https://blog.fsck.com/2026/03/09/superpowers-5/)
- [HN discussion: Superpowers](https://news.ycombinator.com/item?id=45547344)
- [How I Use Every Claude Code Feature (Shrivu Shankar)](https://blog.sshh.io/p/how-i-use-every-claude-code-feature)
- [Minimalist Claude Code Task Management (Nick Tune)](https://medium.com/nick-tune-tech-strategy-blog/minimalist-claude-code-task-management-workflow-7b7bdcbc4cc1)
- [Claude Code Customization Guide (alexop.dev)](https://alexop.dev/posts/claude-code-customization-guide-claudemd-skills-subagents/)
- [Skills vs Commands vs Subagents (youngleaders.tech)](https://www.youngleaders.tech/p/claude-skills-commands-subagents-plugins)
- [vinicius91carvalho/.claude](https://github.com/vinicius91carvalho/.claude)
- [awesome-claude-code](https://github.com/hesreallyhim/awesome-claude-code)
