/**
 * Skill Activation Control (No Skills)
 *
 * Same prompt and task as skill-activation, but the fixture has
 * NO skill files and no skill references in the template.
 * This is the control group for comparing skill vs. no-skill outcomes.
 *
 * Asserts:
 * 1. Agent enters skill-eval mode
 * 2. A new commit exists
 * 3. Working tree is clean
 */

import type { EvalScenario } from '../harness.js'
import {
  assertCurrentMode,
  assertNewCommit,
  assertCleanWorkingTree,
} from '../assertions.js'

export const skillActivationControlScenario: EvalScenario = {
  id: 'skill-activation-control',
  name: 'Skill activation control: same task, no skills',
  fixture: 'tanstack-start-skills-control',
  fixtureSetup: [
    `cat >> .kata/kata.yaml << 'EOF'
  skill-eval:
    name: "Skill Eval"
    description: "Eval-only mode for testing baseline without skills"
    template: skill-eval.md
    stop_conditions: [tasks_complete, committed]
    issue_handling: "none"
    intent_keywords: ["skill-eval:"]
    workflow_prefix: "SE"
EOF`,
  ],
  prompt:
    'skill-eval: Add a /health endpoint that returns { status: "ok" }. Plan the approach first, then write it using TDD.',
  timeoutMs: 12 * 60 * 1000,
  checkpoints: [
    assertCurrentMode('skill-eval'),
    assertNewCommit(),
    assertCleanWorkingTree(),
  ],
}
