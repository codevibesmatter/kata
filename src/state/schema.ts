import { z } from 'zod'

/**
 * Stop condition types — validated enum for modes.yaml stop_conditions field.
 * Adding a new stop condition requires updating this array AND implementing
 * the check in the stop-conditions hook.
 */
export const STOP_CONDITION_TYPES = [
  'tasks_complete',
  'committed',
  'pushed',
  'tests_pass',
  'feature_tests_added',
  'spec_valid',
] as const

export type StopCondition = (typeof STOP_CONDITION_TYPES)[number]

/**
 * Valid mode categories — single source of truth for ModeConfigSchema.category enum.
 */
export const VALID_CATEGORIES = [
  'planning',
  'implementation',
  'investigation',
  'management',
  'special',
  'system',
] as const

export type ModeCategory = (typeof VALID_CATEGORIES)[number]

/**
 * Session state schema - represents the current state of a Claude Code session
 * including mode, phase, and workflow tracking.
 */
export const SessionStateSchema = z
  .object({
    // Session identity
    sessionId: z.string().uuid().optional(), // Optional for legacy files
    workflowId: z.string().optional(), // Optional for legacy files
    issueNumber: z.number().nullable().optional(), // Can be null in legacy files
    issueType: z.string().optional(), // e.g., "task", "feature", "bug", "chore"
    issueTitle: z.string().optional(), // Issue title for micro planning detection
    title: z.string().optional(), // Alias for issueTitle (from link-issue.sh)
    githubType: z.string().optional(), // GitHub issue type from link-issue.sh

    // Mode tracking
    sessionType: z.string().optional(), // Optional for legacy files
    currentMode: z.string().optional(), // Optional for legacy files
    previousMode: z.string().optional(),

    // Phase tracking
    currentPhase: z.string().nullable().optional(), // Can be null in legacy files
    completedPhases: z.array(z.string()).default([]),

    // Template info
    template: z.string().optional(),
    phases: z.array(z.string()).default([]),

    // Mode history - supports both legacy (array of strings) and new (array of objects) formats
    modeHistory: z
      .array(
        z.union([
          z.string(), // Legacy format: just the mode name
          z.object({
            // New format: full entry with timestamps
            mode: z.string(),
            enteredAt: z.string(),
            exitedAt: z.string().optional(),
          }),
        ]),
      )
      .default([]),

    // State metadata - tracks per-mode state
    modeState: z
      .record(
        z.object({
          status: z.enum(['active', 'completed', 'abandoned', 'paused']), // Include 'paused' for legacy
          enteredAt: z.string().optional(), // Optional for legacy files with pausedAt instead
          exitedAt: z.string().optional(),
          pausedAt: z.string().optional(), // Legacy field
          resumedAt: z.string().optional(), // Legacy field
          currentPhase: z.string().optional(), // Some states track phase here
          completedPhases: z.array(z.string()).optional(), // Some states track this here
        }),
      )
      .default({}),

    // Timestamps
    startedAt: z.string().optional(),
    updatedAt: z.string().optional(),
    workflowCompletedAt: z.string().optional(),

    // Session metadata (legacy - preserved for compatibility)
    branch: z.string().optional(),
    // beadsCreated supports both legacy (number[]) and new (object[]) formats
    beadsCreated: z
      .array(
        z.union([
          z.number(), // Legacy format: just bead ID
          z.object({
            // New format: phase → bead mapping with timestamp
            phaseId: z.string(),
            beadId: z.string(),
            createdAt: z.string(),
          }),
        ]),
      )
      .default([]),
    editedFiles: z.array(z.string()).default([]),
    ledger: z
      .object({
        corrections: z.array(z.string()).default([]),
        errors: z.array(z.string()).default([]),
        decisions: z.array(z.string()).default([]),
        discoveries: z.array(z.string()).default([]),
      })
      .optional(),

    // Flags (legacy - preserved for backwards compatibility with existing state files)
    todosWritten: z.boolean().optional(),
    todosWrittenAt: z.string().optional(),

    // One-off session (--tmp flag) - custom template not registered in modes.yaml
    isTemporary: z.boolean().optional(),

    // Spec path (for implementation mode)
    specPath: z.string().optional(),

    // Workflow directory (for task-based tracking)
    workflowDir: z.string().optional(),
  })
  .passthrough() // Allow extra fields from legacy state files

export type SessionState = z.infer<typeof SessionStateSchema>

// Legacy mode schemas removed — see KataConfigSchema in config/kata-config.ts
// VALID_CATEGORIES kept for register-mode.ts and init-mode.ts backwards compat
