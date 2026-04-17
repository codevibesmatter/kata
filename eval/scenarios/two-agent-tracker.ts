/**
 * Two-Agent File-Edit Tracker Eval
 *
 * Runs two concurrent Claude agents in task mode against the same project,
 * each editing disjoint files. Proves the per-session file-edit tracker
 * (src/tracking/edits-log.ts + can-exit scoping) works end-to-end under
 * real concurrency.
 */

import type { EvalScenario } from '../harness.js'
import {
  assertTwoCommitsSinceStart,
  assertCommitsScopedToEachSession,
} from '../assertions.js'

export const twoAgentTrackerScenario: EvalScenario = {
  id: 'two-agent-tracker',
  name: 'Two-agent file-edit tracker',
  fixture: 'tanstack-start',
  templatePath: '.kata/templates/task.md',
  // Pre-install deps so neither agent triggers a lockfile-modifying install at runtime.
  fixtureSetup: ['bun install'],
  agents: [
    { prompt: "Add a utility function to src/utils/foo.ts that returns 42." },
    { prompt: "Add a utility function to src/utils/bar.ts that returns 'hello'." },
  ],
  timeoutMs: 10 * 60 * 1000,
  checkpoints: [
    assertTwoCommitsSinceStart(),
    assertCommitsScopedToEachSession(),
  ],
}
