/**
 * Planning Interview Eval
 *
 * Scenario: Verify the interview phase (P1) triggers AskUserQuestion
 * during planning mode entry.
 *
 * The planning template includes structured interview rounds that use
 * AskUserQuestion. The harness intercepts and pauses the session.
 * This scenario verifies that:
 * 1. Claude enters planning mode
 * 2. Planning mode appears in session history
 * 3. The interview AskUserQuestion fires with valid structure
 * 4. Native phase tasks are created by kata enter
 */

import type { EvalScenario } from '../harness.js'
import {
  assertCurrentMode,
  assertModeInHistory,
  assertInterviewQuestionCaptured,
  assertNativeTaskCount,
} from '../assertions.js'

export const planningInterviewScenario: EvalScenario = {
  id: 'planning-interview',
  name: 'Planning mode: interview phase triggers AskUserQuestion',
  templatePath: '.kata/templates/planning.md',
  prompt:
    'Plan a notifications feature for this app. ' +
    'Users should receive in-app and email notifications for key events. ' +
    'Start by gathering requirements through the interview process.',
  maxTurns: 15,
  timeoutMs: 5 * 60 * 1000,
  checkpoints: [
    assertCurrentMode('planning'),
    assertModeInHistory('planning'),
    assertInterviewQuestionCaptured(),
    assertNativeTaskCount(5),
  ],
}
