/**
 * Task Discipline (fixture) — verify agents use pre-created native tasks correctly.
 *
 * Uses tanstack-start fixture (CI-friendly, no --project required).
 * Drives the agent through task mode and asserts:
 * 1. Standard workflow checks (mode, commit, clean tree, can-exit)
 * 2. Native tasks were created (>= 3)
 * 3. Agent did NOT call TaskCreate (used pre-created tasks)
 * 4. All native tasks completed
 * 5. Dependency order respected
 */

import type { EvalScenario } from '../harness.js'
import { workflowPresets, taskDisciplinePresets } from '../assertions.js'

export const taskDisciplineScenario: EvalScenario = {
  id: 'task-discipline',
  name: 'Task discipline: date formatter',
  templatePath: '.claude/workflows/templates/task.md',
  prompt:
    'Add a utility function that formats a Date as YYYY-MM-DD. ' +
    'Include a simple test that verifies the format.',
  timeoutMs: 10 * 60 * 1000,
  checkpoints: [
    ...workflowPresets('task'),
    ...taskDisciplinePresets(),
  ],
}
