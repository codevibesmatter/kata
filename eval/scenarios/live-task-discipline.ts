/**
 * Live Task Discipline — verify agents use pre-created native tasks correctly.
 *
 * Requires --project flag pointing to a real, configured kata project.
 * Drives the agent through task mode and asserts:
 * 1. Standard live workflow checks (session, mode, commit, clean tree, can-exit)
 * 2. Native tasks were created (>= 3)
 * 3. Agent did NOT call TaskCreate (used pre-created tasks)
 * 4. All native tasks completed
 * 5. Dependency order respected
 */

import type { EvalScenario } from '../harness.js'
import { liveTaskDisciplinePresets } from '../assertions.js'

export const liveTaskDisciplineScenario: EvalScenario = {
  id: 'live-task-discipline',
  name: 'Live: task discipline',
  prompt:
    'Add a utility function that generates a random hex color code. ' +
    'It should return a string like "#a3f1b2". Include a simple test.',
  timeoutMs: 15 * 60 * 1000,
  checkpoints: [
    ...liveTaskDisciplinePresets('task'),
  ],
}
