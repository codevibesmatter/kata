/**
 * Implementation Task Generation — Default impl-test-review pattern
 *
 * Tests that task generation works correctly with the default impl-test-review
 * subphase pattern (3-step: impl → test → review) and a pre-seeded 2-phase spec.
 *
 * Uses tanstack-start fixture with pre-seeded spec at
 * planning/specs/100-health-endpoint.md (2 phases: health endpoint + uptime).
 *
 * Asserts:
 * 1. Standard workflow checks (mode, commit, clean tree, can-exit)
 * 2. Task discipline (pre-created tasks used, all completed, order respected)
 * 3. Subphase pattern expanded: p2.1:impl, p2.1:test, p2.1:review, p2.2:impl, p2.2:test, p2.2:review
 * 4. Test tasks have check-phase instruction
 */

import type { EvalScenario } from '../harness.js'
import {
  workflowPresets,
  taskDisciplinePresets,
  implTaskGenPresets,
} from '../assertions.js'

export const implTaskGenDefaultScenario: EvalScenario = {
  id: 'impl-task-gen-default',
  name: 'Implementation task gen: default impl-test-review pattern',
  templatePath: '.kata/templates/implementation.md',
  fixture: 'tanstack-start',
  prompt:
    'Implement the health endpoint feature from the approved spec at planning/specs/100-health-endpoint.md. ' +
    'The issue number is 100. Follow all phases in the spec.',
  timeoutMs: 15 * 60 * 1000,
  checkpoints: [
    ...workflowPresets('implementation'),
    ...taskDisciplinePresets(),
    ...implTaskGenPresets(),
  ],
}
