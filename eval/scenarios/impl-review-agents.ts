/**
 * Implementation Review Agents — review-agent + gemini + codex run during each REVIEW step
 *
 * Tests that the REVIEW sub-phase step runs all three reviewers sequentially:
 * 1. review-agent (built-in, always)
 * 2. kata review --provider=gemini
 * 3. kata review --provider=codex
 *
 * Uses tanstack-start fixture with fixtureSetup to enable both external providers
 * alongside the built-in review-agent in kata.yaml.
 *
 * Uses pre-seeded spec at planning/specs/100-health-endpoint.md (2 phases).
 *
 * Asserts:
 * 1. Standard workflow checks (mode, commit, clean tree, can-exit)
 * 2. Task discipline (pre-created tasks used, all completed, order respected)
 * 3. Subphase pattern expanded with REVIEW tasks per phase (p2.1:review, p2.2:review)
 * 4. review-agent spawned (transcript contains "review-agent")
 * 5. gemini review ran (transcript contains "--provider=gemini")
 * 6. codex review ran (transcript contains "--provider=codex")
 */

import type { EvalScenario } from '../harness.js'
import {
  workflowPresets,
  taskDisciplinePresets,
  implReviewAgentsPresets,
  assertTranscriptContains,
} from '../assertions.js'

export const implReviewAgentsScenario: EvalScenario = {
  id: 'impl-review-agents',
  name: 'Implementation: review-agent + gemini + codex run during REVIEW steps',
  templatePath: '.kata/templates/implementation.md',
  fixture: 'tanstack-start',
  fixtureSetup: [
    // kata update writes a fresh kata.yaml with reviews commented out.
    // Uncomment the reviews block and set code_review: true + code_reviewers list.
    "sed -i 's/^# reviews:/reviews:/' .kata/kata.yaml",
    "sed -i 's/^#   code_review:.*$/  code_review: true/' .kata/kata.yaml",
    "sed -i '/code_reviewer:/d' .kata/kata.yaml",
    "sed -i '/^  code_review: true/a\\  code_reviewers:' .kata/kata.yaml",
    "sed -i '/^  code_reviewers:/a\\    - codex' .kata/kata.yaml",
    "sed -i '/^  code_reviewers:/a\\    - gemini' .kata/kata.yaml",
  ],
  prompt:
    'Implement the health endpoint feature from the approved spec at planning/specs/100-health-endpoint.md. ' +
    'The issue number is 100. Follow all phases in the spec.',
  timeoutMs: 25 * 60 * 1000,
  checkpoints: [
    ...workflowPresets('implementation'),
    ...taskDisciplinePresets(),
    ...implReviewAgentsPresets(),
    assertTranscriptContains('--provider=gemini', 'gemini review ran'),
    assertTranscriptContains('--provider=codex', 'codex review ran'),
  ],
}
