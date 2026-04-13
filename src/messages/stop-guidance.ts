// Stop hook guidance messages
// Centralized here so stop hook doesn't hardcode them

export interface StopGuidance {
  nextPhase?: {
    beadId: string // Legacy field name, used for task ID
    title: string
    instructions?: string
  }
  /** Pre-formatted next step message (use this instead of rebuilding in shell) */
  nextStepMessage?: string
  templateFile?: string
  escapeHatch: string
}

/**
 * Get the escape hatch message (always the same)
 */
export function getEscapeHatchMessage(): string {
  return `**🚨 ONLY IF GENUINELY BLOCKED:**
If you have a legitimate question that prevents progress (e.g., unclear requirements,
ambiguous spec, need user decision), use \`AskUserQuestion\` to get clarification.
The conversation will pause until user responds, then you can continue.
**DO NOT abuse this to skip conditions.** Only for genuine blockers where you cannot proceed.`
}

/**
 * Get next step guidance message
 */
export function getNextStepMessage(nextTask?: { id: string; title: string }): string {
  if (!nextTask) {
    return ''
  }

  return `**🎯 NEXT STEP (DO NOT SKIP):**
1. DO THE ACTUAL WORK for this task
2. When work is COMPLETE: TaskUpdate(taskId="X", status="completed")

**Current task:** ${nextTask.title}

**⚠️ WARNING: Do NOT bulk-complete tasks just to pass this check.**
Each task must be ACTUALLY COMPLETED with real work.
Tasks should be completed IN ORDER, not all at once.

**📏 Session Length is NOT a Limit**
You have UNLIMITED time and 1M context for this session.
Continue until ALL conditions are met.`
}
