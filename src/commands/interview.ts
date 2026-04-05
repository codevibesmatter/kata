// kata interview <category> — structured interview skill
// Outputs interview config as JSON for the agent to drive via AskUserQuestion.
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import jsYaml from 'js-yaml'
import { z } from 'zod'
import { findProjectDir, getPackageRoot } from '../session/lookup.js'

// ── Zod Schemas ──

export const InterviewOptionSchema = z.object({
  label: z.string().min(1),
  description: z.string().optional(),
})

export const InterviewRoundSchema = z.object({
  header: z.string().min(1),
  question: z.string().min(1),
  options: z.array(InterviewOptionSchema).optional(),
  freeform: z.boolean().optional(),
  multiSelect: z.boolean().optional(),
})

export const InterviewCategorySchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  rounds: z.array(InterviewRoundSchema).min(1),
})

// ── Types ──

export type InterviewOption = z.infer<typeof InterviewOptionSchema>
export type InterviewRound = z.infer<typeof InterviewRoundSchema>
export type InterviewCategory = z.infer<typeof InterviewCategorySchema>

export interface InterviewResult {
  category: string
  answers: Array<{
    header: string
    question: string
    answer: string | string[]
  }>
  completedAt: string
}

/**
 * Load an interview category config.
 * Checks .kata/interviews/{category}.yaml first, falls back to batteries.
 */
export function loadInterviewCategory(category: string): InterviewCategory {
  // Try project-level first
  try {
    const projectDir = findProjectDir()
    const projectPath = join(projectDir, '.kata', 'interviews', `${category}.yaml`)
    if (existsSync(projectPath)) {
      const raw = readFileSync(projectPath, 'utf-8')
      return InterviewCategorySchema.parse(jsYaml.load(raw))
    }
  } catch {
    // Fall through to batteries
  }

  // Try batteries
  const batteriesPath = join(getPackageRoot(), 'batteries', 'interviews', `${category}.yaml`)
  if (!existsSync(batteriesPath)) {
    throw new Error(`Unknown interview category: ${category}`)
  }
  const raw = readFileSync(batteriesPath, 'utf-8')
  return InterviewCategorySchema.parse(jsYaml.load(raw))
}

/**
 * List available interview categories
 */
export function listCategories(): string[] {
  const categories = new Set<string>()

  // From batteries
  const batteriesDir = join(getPackageRoot(), 'batteries', 'interviews')
  if (existsSync(batteriesDir)) {
    for (const f of readdirSync(batteriesDir)) {
      if (f.endsWith('.yaml')) categories.add(f.replace('.yaml', ''))
    }
  }

  // From project
  try {
    const projectDir = findProjectDir()
    const projectInterviewsDir = join(projectDir, '.kata', 'interviews')
    if (existsSync(projectInterviewsDir)) {
      for (const f of readdirSync(projectInterviewsDir)) {
        if (f.endsWith('.yaml')) categories.add(f.replace('.yaml', ''))
      }
    }
  } catch {
    // No project dir
  }

  return [...categories].sort()
}

/**
 * kata interview <category>
 *
 * Run a structured interview. For each round in the category config,
 * outputs AskUserQuestion-compatible JSON that the agent uses to prompt the user.
 * Returns structured InterviewResult as JSON.
 */
export async function interview(args: string[]): Promise<void> {
  const category = args[0]

  if (!category || category === '--list') {
    const cats = listCategories()
    process.stdout.write(JSON.stringify({ available: cats }) + '\n')
    return
  }

  try {
    const config = loadInterviewCategory(category)

    // Output the interview config as structured JSON for the agent to use
    // The agent will use AskUserQuestion for each round based on this output
    const result: InterviewResult = {
      category,
      answers: config.rounds.map((round) => ({
        header: round.header,
        question: round.question,
        answer: '', // To be filled by agent via AskUserQuestion
      })),
      completedAt: '',
    }

    // Output the interview definition so the agent knows what to ask
    process.stdout.write(
      JSON.stringify({
        category,
        name: config.name,
        description: config.description,
        rounds: config.rounds,
        outputTemplate: result,
      }) + '\n',
    )
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    if (message.includes('Unknown interview category')) {
      const cats = listCategories()
      process.stderr.write(`Error: ${message}\nAvailable categories: ${cats.join(', ')}\n`)
    } else {
      process.stderr.write(`Error loading interview config: ${message}\n`)
    }
    process.exitCode = 1
  }
}
