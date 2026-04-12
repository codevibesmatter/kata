/**
 * Planning Review Agents — review-agent + gemini + codex spawn simultaneously in P3
 *
 * Tests that the P3 spec review step spawns all three reviewers in a single parallel
 * message (run_in_background=true) rather than running them sequentially.
 *
 * Uses tanstack-start fixture with:
 * - A pre-seeded spec at planning/specs/200-dark-mode.md (status: needs-review)
 * - spec_reviewers: [gemini, codex] added to kata.yaml
 *
 * The agent picks up the spec at needs-review status and runs P3 directly,
 * bypassing P0-P2 interview/research/writing phases.
 *
 * Asserts:
 * 1. Standard planning workflow checks (mode, commit, clean tree, can-exit, spec approved)
 * 2. review-agent spawned (transcript contains "review-agent")
 * 3. gemini spec review ran (transcript contains "--provider=gemini")
 * 4. codex spec review ran (transcript contains "--provider=codex")
 * 5. Reviewers were spawned with run_in_background (transcript contains "run_in_background")
 */

import type { EvalScenario } from '../harness.js'
import {
  planningPresets,
  assertTranscriptContains,
} from '../assertions.js'

export const planningReviewAgentsScenario: EvalScenario = {
  id: 'planning-review-agents',
  name: 'Planning: review-agent + gemini + codex spawn simultaneously in P3',
  fixture: 'tanstack-start',
  fixtureSetup: [
    // kata update comments out the reviews block; uncomment it and add spec reviewers
    "sed -i 's/^# reviews:/reviews:/' .kata/kata.yaml",
    "sed -i '/^reviews:/a\\  spec_review: true' .kata/kata.yaml",
    "sed -i '/^  spec_review: true/a\\  spec_reviewers:' .kata/kata.yaml",
    "sed -i '/^  spec_reviewers:/a\\    - codex' .kata/kata.yaml",
    "sed -i '/^  spec_reviewers:/a\\    - gemini' .kata/kata.yaml",
  ],
  prompt:
    'The dark mode spec at planning/specs/200-dark-mode.md has status: needs-review. ' +
    'Enter planning mode and run the P3 spec review gate on it. ' +
    'The issue number is 200.',
  timeoutMs: 20 * 60 * 1000,
  checkpoints: [
    ...planningPresets(),
    assertTranscriptContains('review-agent', 'review-agent spawned in transcript'),
    assertTranscriptContains('--provider=gemini', 'gemini spec review ran'),
    assertTranscriptContains('--provider=codex', 'codex spec review ran'),
    assertTranscriptContains('run_in_background', 'reviewers spawned with run_in_background (parallel)'),
  ],
}
