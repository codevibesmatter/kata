/**
 * Live Research — research mode in a real project.
 *
 * Requires --project flag pointing to a real, configured kata project.
 * Agent explores a topic and documents findings without making code changes.
 *
 * Asserts:
 * 1. Session initialized with mode
 * 2. Agent entered research mode
 * 3. Agent stayed in research mode (no mode switches)
 * 4. New commit since baseline (research doc committed)
 * 5. Working tree is clean
 * 6. kata can-exit passes
 */

import type { EvalScenario } from '../harness.js'
import {
  liveWorkflowPresets,
  assertStayedInMode,
  assertResearchDocCreated,
} from '../assertions.js'

export const liveResearchScenario: EvalScenario = {
  id: 'live-research',
  name: 'Live: research mode',
  prompt:
    'Research the test coverage in this project. ' +
    'Explore what testing frameworks are used, what areas have tests, ' +
    'what areas lack tests, and document your findings.',
  timeoutMs: 15 * 60 * 1000,
  checkpoints: [
    ...liveWorkflowPresets('research'),
    assertStayedInMode('research'),
    assertResearchDocCreated(),
  ],
}
