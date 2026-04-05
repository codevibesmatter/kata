/**
 * Skill Activation Eval (Deterministic)
 *
 * Scenario: "Add a /health endpoint" using skill-eval mode with
 * quick-planning and TDD skills.
 *
 * Asserts:
 * 1. Agent enters skill-eval mode
 * 2. quick-planning SKILL.md was read
 * 3. tdd SKILL.md was read
 * 4. Skills were read in order (planning before TDD)
 * 5. A new commit exists
 * 6. Working tree is clean
 */

import type { EvalScenario } from '../harness.js'
import {
  assertCurrentMode,
  assertNewCommit,
  assertCleanWorkingTree,
  skillActivationPresets,
} from '../assertions.js'

export const skillActivationScenario: EvalScenario = {
  id: 'skill-activation',
  name: 'Skill activation: plan then TDD implement',
  fixture: 'tanstack-start-skills',
  fixtureSetup: [
    `cat >> .kata/kata.yaml << 'EOF'
  skill-eval:
    name: "Skill Eval"
    description: "Eval-only mode for testing skill activation reliability"
    template: "skill-eval"
    stop_conditions: [tasks_complete, committed]
    issue_handling: "none"
    intent_keywords: [skill, health, endpoint, plan and implement]
    workflow_prefix: "SE"
EOF`,
  ],
  prompt:
    'Add a /health endpoint that returns { status: "ok" }. Plan first, then implement using TDD.',
  timeoutMs: 12 * 60 * 1000,
  checkpoints: [
    assertCurrentMode('skill-eval'),
    ...skillActivationPresets(),
    assertNewCommit(),
    assertCleanWorkingTree(),
  ],
}
