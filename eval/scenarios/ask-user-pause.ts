/**
 * AskUserQuestion Pause Test
 *
 * Verifies that the harness properly pauses the agent when AskUserQuestion is used
 * with multiple questions (the typical real-world pattern).
 *
 * Asserts:
 * 1. The .eval/pending-question.json file was written
 * 2. It has a valid sessionId
 * 3. Multiple questions were captured
 */

import type { EvalScenario, EvalCheckpoint } from '../harness.js'

const assertPaused: EvalCheckpoint = {
  name: 'Session paused with pendingQuestion',
  assert: (ctx) => {
    if (!ctx.fileExists('.eval/pending-question.json')) {
      return 'No .eval/pending-question.json — AskUserQuestion was not intercepted'
    }
    try {
      const data = JSON.parse(ctx.readFile('.eval/pending-question.json'))
      if (!data.sessionId) {
        return 'pending-question.json has no sessionId'
      }
      if (!data.questions || data.questions.length === 0) {
        return 'pending-question.json has no questions'
      }
      return null
    } catch {
      return 'pending-question.json is not valid JSON'
    }
  },
}

const assertMultipleQuestions: EvalCheckpoint = {
  name: 'Multiple questions captured',
  assert: (ctx) => {
    if (!ctx.fileExists('.eval/pending-question.json')) {
      return 'No pending-question.json'
    }
    try {
      const data = JSON.parse(ctx.readFile('.eval/pending-question.json'))
      if (!data.questions || data.questions.length < 2) {
        return `Expected 2+ questions, got ${data.questions?.length ?? 0}`
      }
      // Verify each question has the expected structure
      for (let i = 0; i < data.questions.length; i++) {
        const q = data.questions[i]
        if (!q.question || !q.header || !q.options || q.options.length < 2) {
          return `Question ${i} is malformed: missing question/header/options`
        }
      }
      return null
    } catch {
      return 'pending-question.json is not valid JSON'
    }
  },
}

export const askUserPauseScenario: EvalScenario = {
  id: 'ask-user-pause',
  name: 'AskUserQuestion pause — verify interrupt stops agent',
  prompt: [
    'Use the AskUserQuestion tool right now with MULTIPLE questions in a single call.',
    'Include these two questions:',
    '',
    'Question 1:',
    '  header: "Framework"',
    '  question: "Which framework should we use for the frontend?"',
    '  multiSelect: false',
    '  options:',
    '    - React — Popular component library',
    '    - Vue — Progressive framework',
    '    - Svelte — Compiler-based approach',
    '',
    'Question 2:',
    '  header: "Language"',
    '  question: "Which language for the backend API?"',
    '  multiSelect: false',
    '  options:',
    '    - TypeScript — Type-safe JS',
    '    - Go — Fast compiled language',
    '    - Rust — Memory-safe systems language',
    '',
    'Send both questions in ONE AskUserQuestion call. Do NOT do anything else.',
  ].join('\n'),
  maxTurns: 5,
  timeoutMs: 2 * 60 * 1000,
  checkpoints: [assertPaused, assertMultipleQuestions],
}
