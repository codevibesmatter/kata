// packages/workflow-management/src/validation/schemas.ts
// Zod schemas for validating template phase configurations
import { z } from 'zod'

/**
 * Schema for task configuration within a phase
 */
export const phaseTaskConfigSchema = z.object({
  title: z.string().min(1, 'Task config title cannot be empty'),
  labels: z.array(z.string()).optional().default([]),
  depends_on: z.array(z.string()).optional(),
})

/**
 * Schema for an external agent step configuration.
 * When a step has an `agent` field, the step runner invokes
 * the specified provider with the named prompt and assembled context.
 */
export const agentStepConfigSchema = z.object({
  /** Provider name: 'claude' | 'gemini' | 'codex' or a wm.yaml variable like '${providers.default}' */
  provider: z.string().min(1, 'Agent provider cannot be empty'),
  /** Override model for the provider. Optional — uses provider default. */
  model: z.string().optional(),
  /** Prompt template name (loads from project .kata/prompts/ or batteries/prompts/{name}.md) */
  prompt: z.string().min(1, 'Agent prompt name cannot be empty'),
  /** Raw inline prompt text (alternative to named prompt template, used by --custom CLI flag) */
  raw_prompt: z.string().optional(),
  /** Named context sources to assemble into the prompt */
  context: z.array(z.string()).optional(),
  /** Output artifact path (relative to project root). Supports {date} placeholder. */
  output: z.string().optional(),
  // ── Agent capability options (forwarded to provider.run) ──

  /** Tools the agent can use. Default: [] (text-only, no tools). */
  allowed_tools: z.array(z.string()).optional(),
  /** Max agentic turns. Default: 3 (review/judge mode). */
  max_turns: z.number().min(1).optional(),
  /** Execution timeout in seconds. Default: 300 (5 min). */
  timeout: z.number().min(1).optional(),
})

// ── Gate schema (bash-only) ──

export const gateSchema = z.object({
  bash: z.string().min(1),
  expect: z.string().optional(),
  expect_exit: z.number().optional(),
  on_fail: z.string().optional(),
}).strict()

// ── Hint schemas (6 types) ──

export const readHintSchema = z.object({
  read: z.string().min(1),
  section: z.string().optional(),
})

export const bashHintSchema = z.object({
  bash: z.string().min(1),
})

export const searchHintSchema = z.object({
  search: z.string().min(1),
  glob: z.string().optional(),
})

export const agentHintSchema = z.object({
  agent: z.object({
    subagent_type: z.string().min(1),
    prompt: z.string().min(1),
  }),
})

export const skillHintSchema = z.object({
  skill: z.string().min(1),
  args: z.string().optional(),
})

export const askHintSchema = z.object({
  ask: z.object({
    question: z.string().min(1),
    header: z.string().optional(),
    options: z.array(z.object({
      label: z.string().min(1),
      description: z.string().optional(),
    })).optional(),
    multiSelect: z.boolean().optional(),
  }),
})

export const hintSchema = z.union([
  readHintSchema,
  bashHintSchema,
  searchHintSchema,
  agentHintSchema,
  skillHintSchema,
  askHintSchema,
])

/**
 * Schema for a step within a phase
 * Steps are individual trackable units within a phase (e.g., interview rounds)
 */
export const phaseStepSchema = z.object({
  id: z.string().min(1, 'Step ID cannot be empty'),
  title: z.string().optional(),
  instruction: z.string().optional(),
  skill: z.string().optional(),
  '$ref': z.string().optional(),
  vars: z.record(z.string(), z.string()).optional(),
  agent: agentStepConfigSchema.optional(),
  gate: gateSchema.optional(),
  hints: z.array(hintSchema).optional(),
}).refine(
  (s) => s['$ref'] || (s.title && s.title.length > 0),
  { message: 'title is required when $ref is not set' }
)

/**
 * Schema for subphase pattern (used by expansion: 'spec' phases)
 * Defines what tasks to create for each spec phase
 */
export const subphasePatternSchema = z.object({
  id_suffix: z.string().min(1, 'Subphase ID suffix cannot be empty'),
  title_template: z.string().min(1, 'Title template cannot be empty'),
  todo_template: z.string().min(1, 'Todo template cannot be empty'),
  active_form: z.string().min(1, 'Active form cannot be empty'),
  labels: z.array(z.string()).default([]),
  depends_on_previous: z.boolean().optional(),
  instruction: z.string().optional(),
  agent: agentStepConfigSchema.optional(),
  gate: gateSchema.optional(),
  hints: z.array(hintSchema).optional(),
})

// ── Agent protocol schema (for expansion: 'agent' phases) ──

export const agentProtocolSchema = z.object({
  max_tasks: z.number().int().positive().default(10),
  require_labels: z.array(z.string()).optional(),
})

/**
 * Schema for a single phase definition
 * Phase IDs must match pattern: p0, p1, p2, p2.1, p2.2 (subphases), or p2-name (named subphases)
 */
export const phaseSchema = z.object({
  id: z.string().regex(/^p\d+(\.\d+|-[a-z][a-z0-9-]*)?$/, 'Phase ID must match pattern: p0, p1, p2, p2.1, or p2-name'),
  name: z.string().min(1, 'Phase name cannot be empty'),
  stage: z.enum(['setup', 'work', 'close']),
  expansion: z.enum(['spec', 'agent']).optional(),
  agent_protocol: agentProtocolSchema.optional(),
  skill: z.string().optional(), // Phase-level skill (inherited by generated tasks for expansion: spec)
  task_config: phaseTaskConfigSchema.optional(),
  steps: z.array(phaseStepSchema).optional(), // Individual trackable units within phase (e.g., interview rounds)
  subphase_pattern: z.array(subphasePatternSchema).optional(), // Inline array only (string references removed)
}).refine(
  (p) => !p.expansion || p.stage === 'work',
  { message: 'expansion is only allowed on work-stage phases' }
)

/**
 * Schema for array of phases in template
 */
export const templatePhasesSchema = z.array(phaseSchema)

/**
 * Schema for template YAML frontmatter
 */
export const templateYamlSchema = z.object({
  id: z.string().optional(),
  name: z.string().optional(),
  description: z.string().optional(),
  mode: z.string().optional(),
  reviewer_prompt: z.string().optional(),
  phases: templatePhasesSchema.optional(),
  global_conditions: z.array(z.string()).optional(),
  workflow_id_format: z.string().optional(),
})

/**
 * Schema for evidence types in modes.yaml
 */
export const evidenceTypeSchema = z.object({
  description: z.string(),
  pattern: z.string().optional(),
  command: z.string().optional(),
  gate: z.string().optional(),
  format: z.string().optional(),
  default: z.boolean().optional(),
})

/**
 * Schema for all evidence types
 */
export const evidenceTypesSchema = z.record(z.string(), evidenceTypeSchema)

/**
 * Schema for a step definition in steps.yaml (shared step library)
 */
export const stepDefinitionSchema = z.object({
  title: z.string().min(1),
  instruction: z.string().optional(),
  skill: z.string().optional(),
  gate: gateSchema.optional(),
  hints: z.array(hintSchema).optional(),
})

/**
 * Schema for the step library (steps.yaml): a map of step ID → definition
 */
export const stepLibrarySchema = z.record(z.string(), stepDefinitionSchema)

// Type exports
export type StepDefinition = z.infer<typeof stepDefinitionSchema>
export type StepLibrary = z.infer<typeof stepLibrarySchema>
export type AgentStepConfig = z.infer<typeof agentStepConfigSchema>
export type AgentProtocol = z.infer<typeof agentProtocolSchema>
export type PhaseTaskConfig = z.infer<typeof phaseTaskConfigSchema>
export type PhaseStep = z.infer<typeof phaseStepSchema>
export type SubphasePattern = z.infer<typeof subphasePatternSchema>
export type PhaseDefinition = z.infer<typeof phaseSchema>
export type TemplateYaml = z.infer<typeof templateYamlSchema>
export type EvidenceType = z.infer<typeof evidenceTypeSchema>
export type EvidenceTypes = z.infer<typeof evidenceTypesSchema>
export type Gate = z.infer<typeof gateSchema>
export type Hint = z.infer<typeof hintSchema>
