/**
 * Task Mode Eval
 *
 * Scenario: "Add an /about page to the app"
 *
 * Asserts:
 * 1. Claude enters task mode (currentMode: task)
 * 2. A route file was created (diff contains 'about')
 * 3. A commit was made beyond the initial fixture commit
 * 4. kata can-exit returns 0
 */

import type { EvalScenario } from '../harness.js'
import { workflowPresets, assertDiffContains } from '../assertions.js'

export const taskModeScenario: EvalScenario = {
  id: 'task-mode',
  name: 'Task mode: add /about page',
  templatePath: '.claude/workflows/templates/task.md',
  prompt:
    'Add an /about page to this app. It should show the app name and a short description.',
  timeoutMs: 10 * 60 * 1000,
  checkpoints: [
    ...workflowPresets('task'),
    assertDiffContains('about'),
  ],
}
