/**
 * Stop Hook Enforcement — verify the stop hook blocks at each condition.
 *
 * Uses tanstack-start fixture (CI-friendly).
 * The prompt directs the agent step-by-step to trigger stop conditions:
 * 1. Write code but don't commit → stop hook blocks (uncommitted + tasks pending)
 * 2. Commit but don't push → stop hook blocks (unpushed + tasks pending)
 * 3. Push but leave tasks incomplete → stop hook blocks (tasks pending)
 * 4. Complete all tasks → stop hook allows exit
 *
 * Asserts:
 * - Standard workflow checks pass (mode, commit, clean tree, can-exit)
 * - Stop hook blocked at least once
 * - Stop hook blocked for pending tasks
 * - Stop hook eventually allowed exit
 * - All native tasks completed
 * - No TaskCreate calls
 */

import type { EvalScenario } from '../harness.js'
import {
  workflowPresets,
  taskDisciplinePresets,
  stopHookPresets,
} from '../assertions.js'

export const stopHookEnforcementScenario: EvalScenario = {
  id: 'stop-hook-enforcement',
  name: 'Stop hook enforcement: blocks until conditions met',
  templatePath: '.claude/workflows/templates/task.md',
  prompt: [
    'Add a utility function that checks if a string is a palindrome.',
    'Follow these steps IN ORDER, completing each before moving to the next:',
    '',
    'Step 1: Write the palindrome function in a new file (e.g., src/utils/palindrome.ts).',
    'Step 2: Write a simple test for it.',
    'Step 3: Run the build to verify it compiles.',
    'Step 4: Commit your changes.',
    'Step 5: Push to the remote.',
    'Step 6: Mark ALL your tasks as completed using TaskUpdate.',
    '',
    'Important: Follow the pre-created task list. Use TaskList to see tasks,',
    'then TaskUpdate to mark each completed as you go. Do NOT create new tasks.',
  ].join('\n'),
  timeoutMs: 10 * 60 * 1000,
  checkpoints: [
    ...workflowPresets('task'),
    ...taskDisciplinePresets(),
    ...stopHookPresets(),
  ],
}
