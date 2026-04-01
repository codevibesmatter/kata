/**
 * Onboard Eval
 *
 * Scenario: Fresh TanStack Start project, no kata config. Agent sets up kata.
 *
 * Uses tanstack-start-fresh fixture — bare app code, no .claude/ directory.
 *
 * Asserts:
 * 1. .claude/settings.json exists with hooks
 * 2. .kata/kata.yaml exists
 * 3. .kata/templates/ has mode templates
 * 4. Git repository is initialized
 */

import type { EvalScenario } from '../harness.js'
import { onboardPresets } from '../assertions.js'

export const onboardScenario: EvalScenario = {
  id: 'onboard',
  name: 'Fresh project onboard',
  fixture: 'tanstack-start-fresh',
  prompt:
    'Help me get started with this project. kata is installed globally.',
  maxTurns: 40,
  timeoutMs: 10 * 60 * 1000,
  checkpoints: onboardPresets,
}
