/**
 * Live Task — full task lifecycle in a real project.
 *
 * Requires --project flag pointing to a real, configured kata project.
 * Drives the agent through task mode: plan, implement, commit.
 * Uses delta assertions comparing against HEAD at eval start.
 *
 * Asserts:
 * 1. Session initialized with mode
 * 2. Agent entered task mode
 * 3. New commit since baseline
 * 4. Working tree is clean
 * 5. kata can-exit passes
 */

import type { EvalScenario } from '../harness.js'
import { liveWorkflowPresets } from '../assertions.js'

export const liveTaskScenario: EvalScenario = {
  id: 'live-task',
  name: 'Live: task mode lifecycle',
  prompt:
    'Add a health check endpoint that returns JSON with the app name and current timestamp. ' +
    'Keep it simple — just one route that responds to GET requests.',
  timeoutMs: 15 * 60 * 1000,
  checkpoints: [
    ...liveWorkflowPresets('task'),
  ],
}
