/**
 * E2E Implementation — full run with LLM judge evaluation
 *
 * End-to-end test of the complete implementation pipeline:
 * - P2.X: IMPL + TEST + REVIEW per spec phase
 * - P3: Close — commit, push, PR
 * - LLM-as-judge evaluates the complete transcript
 *
 * Uses tanstack-start fixture with pre-seeded spec at
 * planning/specs/100-health-endpoint.md (2 phases, with VP section).
 *
 * Asserts:
 * 1. Standard workflow checks (mode, commit, clean tree, can-exit)
 * 2. Task discipline (pre-created tasks used, all completed, order respected)
 * 3. Review tasks created for each phase
 * 4. LLM judge passes (agent >= 70, system >= 50)
 */

import type { EvalScenario } from '../harness.js'
import {
  workflowPresets,
  taskDisciplinePresets,
  implTaskGenPresets,
  assertJudgePasses,
} from '../assertions.js'

export const implE2eVerifyScenario: EvalScenario = {
  id: 'impl-e2e-verify',
  name: 'E2E implementation with LLM judge',
  templatePath: '.kata/templates/implementation.md',
  fixture: 'tanstack-start',
  prompt:
    'Implement the health endpoint feature from the approved spec at planning/specs/100-health-endpoint.md. ' +
    'The issue number is 100. Follow all phases in the spec.',
  timeoutMs: 25 * 60 * 1000,
  checkpoints: [
    // Deterministic: workflow basics
    ...workflowPresets('implementation'),
    // Deterministic: task discipline
    ...taskDisciplinePresets(),
    // Deterministic: review tasks created
    ...implTaskGenPresets(),
    // LLM judge: evaluate complete transcript
    assertJudgePasses({
      templatePath: '.kata/templates/implementation.md',
      minAgentScore: 70,
      minSystemScore: 50,
    }),
  ],
}
