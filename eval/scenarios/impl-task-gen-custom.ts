/**
 * Implementation Task Generation — Custom 3-step pattern (impl-review-verify)
 *
 * Tests that task generation works with a custom subphase pattern that includes
 * an agent review step between impl and verify.
 *
 * Uses tanstack-start fixture with fixtureSetup to:
 * 1. Create .kata/subphase-patterns.yaml with impl-review-verify pattern
 * 2. Override implementation.md to reference the custom pattern
 *
 * The impl-review-verify pattern has:
 * - impl step (no instruction)
 * - review step (agent: claude, prompt: code-review)
 * - verify step (instruction: kata check-phase)
 *
 * Asserts:
 * 1. Standard workflow checks (mode, commit, clean tree, can-exit)
 * 2. Task discipline (pre-created tasks used, all completed, order respected)
 * 3. Review step exists (p2.1:review, p2.2:review) — custom pattern expanded
 * 4. Agent config carried through (kata review --prompt=code-review)
 * 5. Check instruction carried through (check-phase)
 */

import type { EvalScenario } from '../harness.js'
import {
  workflowPresets,
  taskDisciplinePresets,
  assertNativeTaskHasOriginalId,
  assertNativeTaskHasInstruction,
} from '../assertions.js'

const CUSTOM_SUBPHASE_PATTERNS = `
subphase_patterns:
  impl-review-verify:
    description: "Implement, review with agent, then verify"
    steps:
      - id_suffix: impl
        title_template: "IMPL - {task_summary}"
        todo_template: "Implement {task_summary}"
        active_form: "Implementing {phase_name}"
        labels: [impl]
      - id_suffix: review
        title_template: "REVIEW - {phase_name}"
        todo_template: "Review {phase_name} code"
        active_form: "Reviewing {phase_name}"
        labels: [review]
        depends_on_previous: true
        agent:
          provider: claude
          prompt: code-review
      - id_suffix: verify
        title_template: "VERIFY - {phase_name}"
        todo_template: "Verify {phase_name} implementation"
        active_form: "Verifying {phase_name}"
        labels: [verify]
        depends_on_previous: true
        instruction: "Run: kata check-phase {phase_label} --issue={issue}"
`.trim()

export const implTaskGenCustomScenario: EvalScenario = {
  id: 'impl-task-gen-custom',
  name: 'Implementation task gen: custom impl-review-verify pattern',
  templatePath: '.kata/templates/implementation.md',
  fixture: 'tanstack-start',
  fixtureSetup: [
    // Write custom subphase pattern into .kata/
    `cat > .kata/subphase-patterns.yaml << 'YAML'\n${CUSTOM_SUBPHASE_PATTERNS}\nYAML`,
    // Override implementation template to reference custom pattern
    // sed replaces the subphase_pattern value in the YAML frontmatter
    "sed -i 's/subphase_pattern: impl-test-verify/subphase_pattern: impl-review-verify/' .kata/templates/implementation.md",
  ],
  prompt:
    'Implement the health endpoint feature from the approved spec at planning/specs/100-health-endpoint.md. ' +
    'The issue number is 100. Follow all phases in the spec.',
  timeoutMs: 15 * 60 * 1000,
  checkpoints: [
    ...workflowPresets('implementation'),
    ...taskDisciplinePresets(),
    // Custom pattern: impl-review-verify should create 3 tasks per spec phase
    assertNativeTaskHasOriginalId('p2.1:impl'),
    assertNativeTaskHasOriginalId('p2.1:review'),
    assertNativeTaskHasOriginalId('p2.1:verify'),
    assertNativeTaskHasOriginalId('p2.2:impl'),
    assertNativeTaskHasOriginalId('p2.2:review'),
    assertNativeTaskHasOriginalId('p2.2:verify'),
    // Agent config carried through to task instruction
    assertNativeTaskHasInstruction(/kata review --prompt=code-review/),
    // Check instruction carried through
    assertNativeTaskHasInstruction(/check-phase/),
  ],
}
