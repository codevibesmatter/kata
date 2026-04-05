# Skill Activation Reliability Investigation

**Issue:** #41
**Date:** 2026-04-05
**Status:** Complete

## Summary

Ran skill-activation, skill-activation-control, and skill-quality judge scenarios multiple times to measure skill activation reliability and quality impact.

**Key finding:** Skills are activated reliably (100% skill-read rate across 10 runs), and the judge scores suggest meaningful methodology adherence. However, the control group also completes the task successfully, and without a judge comparison on the control we can't yet quantify the quality delta.

## Phase 1: Statistical Baseline (skill-activation × 5)

All skill-specific checkpoints passed on every run. The one failure was a commit checkpoint (stop-hook timing), not skill-related.

| Run | Result | Turns | Duration | Cost | Skill Checkpoints |
|-----|--------|-------|----------|------|-------------------|
| 1 | PASS | 70 | 281s | $1.05 | 4/4 |
| 2 | PASS | 105 | 348s | $1.05 | 4/4 |
| 3 | PASS | 78 | 296s | $1.16 | 4/4 |
| 4 | PASS | 125 | 417s | $1.46 | 4/4 |
| 5 | FAIL* | 84 | 400s | $1.09 | 4/4 |

**Skill activation rate: 5/5 (100%)**
**Overall pass rate: 4/5 (80%)** — one commit-checkpoint failure unrelated to skills
**Avg duration: 348s** | **Avg cost: $1.16** | **Avg turns: 92**

*Run 5 failed only on `git: new commit created` — all 4 skill checkpoints (read quick-planning, read tdd, correct order) passed.

## Phase 1b: Judge Quality Scores (skill-quality × 5)

| Run | Result | Agent Score | System Score | Verdict | Turns | Duration | Cost |
|-----|--------|-------------|--------------|---------|-------|----------|------|
| 1 | PASS | 88 | 85 | PASS | 116 | 597s | $1.35 |
| 2 | FAIL* | 62 | 80 | FAIL_AGENT | 101 | 484s | $0.90 |
| 3 | PASS | 72 | 80 | PASS | 114 | 541s | $1.19 |
| 4 | PASS | 88 | 82 | PASS | 151 | 635s | $1.11 |
| 5 | PASS | 88 | 88 | PASS | 143 | 656s | $1.75 |

**Judge pass rate: 4/5 (80%)**
**Agent score: avg 79.6, median 88, range 62-88**
**System score: avg 83.0, median 82, range 80-88**

*Run 2 failed on commit checkpoint (same stop-hook issue) and had borderline agent score (62).

## Phase 2: Control Comparison (skill-activation-control × 5)

Same prompt, same task, same kata mode — but NO skill files and no skill references in the template.

| Run | Result | Turns | Duration | Cost |
|-----|--------|-------|----------|------|
| 1 | PASS | 110 | 410s | $1.33 |
| 2 | PASS | 97 | 311s | $0.89 |
| 3 | PASS | 91 | 322s | $0.95 |
| 4 | PASS | 107 | 376s | $1.33 |
| 5 | PASS | 115 | 390s | $1.40 |

**Pass rate: 5/5 (100%)**
**Avg duration: 362s** | **Avg cost: $1.18** | **Avg turns: 104**

## Comparison: Skills vs Control

| Metric | With Skills | Control (No Skills) | Delta |
|--------|-------------|---------------------|-------|
| Task completion rate | 80% | 100% | -20% |
| Avg turns | 92 | 104 | -12 turns |
| Avg duration | 348s | 362s | -14s |
| Avg cost | $1.16 | $1.18 | -$0.02 |

**Observations:**
1. Skills slightly reduce turn count and duration (agent has clearer structure to follow)
2. Cost is essentially identical
3. The control had 100% task completion vs 80% for skills, but the skill failure was a commit-timing issue unrelated to skill activation
4. Without running the judge on control runs, we can't directly compare methodology quality

## Phase 3: Decision

### What we know
- **Skills activate reliably** — 100% read rate across all runs
- **Skills are read in correct order** — 100% ordering compliance
- **Judge scores are generally good** — median agent score 88/100
- **One quality outlier** — run 2 scored 62 (borderline), suggesting some variance in how well the agent follows methodology even after reading skills
- **Control also works** — the task is simple enough that the agent completes it fine without skills

### What we don't know
- **Quality delta** — we didn't run the judge on control scenarios, so we can't compare quality scores head-to-head
- **Complex task behavior** — the /health endpoint is trivial; skills may matter more for complex tasks
- **Skill file content sensitivity** — would different skill wording produce different adherence?

### Recommendation

**Proceed cautiously with skills.** The activation mechanism is reliable and the infrastructure works. However:

1. Before investing in runtime skill support, run the **judge on control scenarios** to measure the actual quality delta
2. Test with a **more complex task** (multi-file feature, architectural decision) where methodology is more likely to differentiate outcomes
3. The current eval infrastructure (scenarios, fixtures, batch runner) is ready for deeper investigation

**Total eval cost for this investigation: ~$16.37**
