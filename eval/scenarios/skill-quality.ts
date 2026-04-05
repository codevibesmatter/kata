/**
 * Skill Quality Eval (LLM Judge)
 *
 * Scenario: Same fixture and prompt as skill-activation, but uses
 * an LLM judge to score methodology adherence instead of just
 * checking that skills were read.
 *
 * Asserts:
 * 1. Agent enters skill-eval mode
 * 2. Both skills were read
 * 3. A new commit exists
 * 4. Working tree is clean
 * 5. LLM judge scores methodology adherence >= 60
 */

import type { EvalScenario } from '../harness.js'
import {
  assertCurrentMode,
  assertSkillRead,
  assertNewCommit,
  assertCleanWorkingTree,
  assertJudgePasses,
} from '../assertions.js'

export const skillQualityScenario: EvalScenario = {
  id: 'skill-quality',
  name: 'Skill quality: judge methodology adherence',
  fixture: 'tanstack-start-skills',
  templatePath: '.kata/templates/skill-eval.md',
  fixtureSetup: [
    `cat >> .kata/kata.yaml << 'EOF'
  skill-eval:
    name: "Skill Eval"
    description: "Eval-only mode for testing skill activation reliability"
    template: skill-eval.md
    stop_conditions: [tasks_complete, committed]
    issue_handling: "none"
    intent_keywords: ["skill-eval:"]
    workflow_prefix: "SE"
EOF`,
  ],
  prompt:
    'skill-eval: Add a /health endpoint that returns { status: "ok" }. Plan the approach first, then write it using TDD.',
  timeoutMs: 15 * 60 * 1000,
  checkpoints: [
    assertCurrentMode('skill-eval'),
    assertSkillRead('quick-planning'),
    assertSkillRead('tdd'),
    assertNewCommit(),
    assertCleanWorkingTree(),
    assertJudgePasses({
      templatePath: '.kata/templates/skill-eval.md',
      minAgentScore: 60,
      minSystemScore: 60,
    }),
  ],
}
