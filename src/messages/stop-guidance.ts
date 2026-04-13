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

/**
 * Get verify-mode challenge message for incomplete VP items.
 * Aggressively pushes back on laziness by reminding the agent of its full capabilities.
 * Only shown after repeated stop attempts (priorBlockCount >= 2) to avoid spam.
 */
export function getVerifyModeChallenge(pendingTitles: string[]): string {
  const itemChallenges = pendingTitles
    .map((title) => `  → "${title}" — Why is this incomplete? You have every tool needed to verify this.`)
    .join('\n')

  return `**🔍 VERIFICATION CHALLENGE — Incomplete Items Detected**

${itemChallenges}

**You are being checked for laziness.** Before claiming any item cannot be completed, consider:

- **You have ALL tools available:** Bash, Read, Write, Edit, Grep, Glob, WebFetch, Agent — use them.
- **You can create test data freely:** Write fixtures, seed databases, generate mock payloads — nothing stops you.
- **You can start servers, hit endpoints, run CLI commands** — do the actual verification, don't just read code.
- **You can spawn sub-agents** for parallel verification work — use Agent tool for complex checks.
- **You can use browser agents** (chrome-devtools-axi) for UI/visual testing — open pages, check rendering, validate interactions.
- **You can install packages, compile, build** — if a step needs setup, do the setup.
- **"I can't verify this" is almost never true.** If a step says "check endpoint returns 200", curl it. If it says "verify file exists", glob it. If it says "run tests", run them. If it says "check the UI", open a browser.

**Every VP step was written to be executable.** If you're skipping steps, you're doing it wrong.
Go back and actually complete each verification step before attempting to exit.`
}
