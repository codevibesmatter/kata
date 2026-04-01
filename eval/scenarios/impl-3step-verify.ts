/**
 * Implementation impl-test-review — 3-step per phase with provider review
 *
 * End-to-end test of the implementation flow with the impl-test-review pattern:
 * - P2.X: IMPL + TEST + REVIEW per spec phase
 * - P3: Close (no separate verify phase — use `kata enter verify` standalone)
 *
 * Uses tanstack-start fixture with pre-seeded spec at
 * planning/specs/100-health-endpoint.md (2 phases, with VP section).
 *
 * Asserts:
 * 1. Standard workflow checks (mode, commit, clean tree, can-exit)
 * 2. Task discipline (pre-created tasks used, all completed, order respected)
 * 3. 3-step pattern expanded: p2.1:impl, p2.1:test, p2.1:review per phase
 * 4. Test task instructions contain check-phase
 * 5. Review tasks exist for each phase
 */

import type { EvalScenario } from '../harness.js'
import {
  workflowPresets,
  taskDisciplinePresets,
  implTaskGenPresets,
  assertNativeTaskHasInstruction,
  assertNativeTaskHasOriginalId,
} from '../assertions.js'

export const impl3StepVerifyScenario: EvalScenario = {
  id: 'impl-3step-verify',
  name: 'Implementation impl-test-review: 3-step per phase',
  templatePath: '.kata/templates/implementation.md',
  fixture: 'tanstack-start',
  prompt:
    'Implement the health endpoint feature from the approved spec at planning/specs/100-health-endpoint.md. ' +
    'The issue number is 100. Follow all phases in the spec.',
  timeoutMs: 20 * 60 * 1000,
  checkpoints: [
    ...workflowPresets('implementation'),
    ...taskDisciplinePresets(),
    ...implTaskGenPresets(),
    // Test task should reference check-phase
    assertNativeTaskHasInstruction(/check-phase/),
    // Review tasks should exist
    assertNativeTaskHasOriginalId('p2.1:review'),
    assertNativeTaskHasOriginalId('p2.2:review'),
  ],
}
