// kata enter - Enter a mode
import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import { resolve, dirname, join } from 'node:path'
import jsYaml from 'js-yaml'
import {
  getCurrentSessionId,
  getStateFilePath,
  findProjectDir,
  getPackageRoot,
} from '../session/lookup.js'
import { readState, stateExists } from '../state/reader.js'
import { writeState } from '../state/writer.js'
import { loadKataConfig, resolveKataModeAlias } from '../config/kata-config.js'
import { generateWorkflowId, generateWorkflowIdForIssue } from '../utils/workflow-id.js'
import { isNativeTasksEnabled } from '../utils/tasks-check.js'
import type { SessionState } from '../state/schema.js'
import { validatePhases, formatValidationErrors } from '../validation/index.js'
import { parseYamlFrontmatterWithError, type SpecPhase, type SpecYaml } from '../yaml/index.js'
import type { SubphasePattern } from '../validation/schemas.js'

// Import from modular enter command
import { buildWorkflowGuidance } from './enter/guidance.js'
import {
  parseTemplateYaml,
  getPhaseTitlesFromTemplate,
  parseAndValidateTemplatePhases,
  getTemplateReviewerPrompt,
} from './enter/template.js'
import { validateGatePlaceholders, type PlaceholderContext } from './enter/placeholder.js'

/**
 * Load mode rules with fallback to batteries/kata.yaml when project config is missing them.
 */
function getModeRules(modeName: string, projectConfig: ReturnType<typeof loadKataConfig>): string[] {
  const modeConfig = projectConfig.modes[modeName]
  if (modeConfig?.rules?.length) return modeConfig.rules

  // Fallback: load from batteries/kata.yaml
  try {
    const batteriesPath = join(getPackageRoot(), 'batteries', 'kata.yaml')
    if (existsSync(batteriesPath)) {
      const raw = readFileSync(batteriesPath, 'utf-8')
      const parsed = jsYaml.load(raw, { schema: jsYaml.CORE_SCHEMA }) as Record<string, unknown>
      const modes = parsed?.modes as Record<string, { rules?: string[] }> | undefined
      if (modes?.[modeName]?.rules?.length) return modes[modeName].rules!
    }
  } catch {
    // Fallback failed, continue without mode rules
  }
  return []
}

/**
 * Output rendered rules to stderr for context injection
 * Replaces raw template dump with actionable rules from kata.yaml
 */
function outputRules(
  modeName: string,
  workflowId: string,
  effectiveTaskRules: string[],
  issueNum?: number,
  hasTasks = true,
): void {
  const config = loadKataConfig()
  const lines: string[] = []

  // Mode rules (orchestration context — "You are a RESEARCHER", etc.)
  const modeRules = getModeRules(modeName, config)
  for (const rule of modeRules) {
    lines.push(`- ${rule}`)
  }

  // Global rules
  if (config.global_rules.length > 0) {
    for (const rule of config.global_rules) {
      lines.push(`- ${rule}`)
    }
  }

  // Task system rules — only when mode has tasks
  if (hasTasks && effectiveTaskRules.length > 0) {
    for (const rule of effectiveTaskRules) {
      lines.push(`- ${rule}`)
    }
  }

  if (lines.length === 0) return

  // biome-ignore lint/suspicious/noConsole: intentional CLI output
  console.error('')
  // biome-ignore lint/suspicious/noConsole: intentional CLI output
  console.error(
    '═══════════════════════════════════════════════════════════════════════════════',
  )
  // biome-ignore lint/suspicious/noConsole: intentional CLI output
  console.error(`📋 RULES: ${modeName}`)
  // biome-ignore lint/suspicious/noConsole: intentional CLI output
  console.error(`   Workflow: ${workflowId}`)
  if (issueNum) {
    // biome-ignore lint/suspicious/noConsole: intentional CLI output
    console.error(`   Issue: #${issueNum}`)
  }
  // biome-ignore lint/suspicious/noConsole: intentional CLI output
  console.error(
    '═══════════════════════════════════════════════════════════════════════════════',
  )
  // biome-ignore lint/suspicious/noConsole: intentional CLI output
  console.error('')
  for (const line of lines) {
    // biome-ignore lint/suspicious/noConsole: intentional CLI output
    console.error(line)
  }
  // biome-ignore lint/suspicious/noConsole: intentional CLI output
  console.error('')
}

import { findSpecFile } from './enter/spec.js'
import {
  type Task,
  buildSpecTasks,
  buildPhaseTasks,
  writeNativeTaskFiles,
} from './enter/task-factory.js'
import { parseArgs, createDefaultState } from './enter/cli.js'
import { createFdNotesFile, createDoctrineNotesFile } from './enter/notes.js'

/**
 * Enter with a custom template (one-off session)
 * Allows using any template file without registering in modes.yaml
 */
async function enterWithCustomTemplate(
  _args: string[],
  parsed: ReturnType<typeof parseArgs>,
): Promise<void> {
  const projectRoot = findProjectDir()

  // Resolve template path
  const templatePath = parsed.template!.startsWith('/')
    ? parsed.template!
    : resolve(projectRoot, parsed.template!)

  // Verify template file exists
  if (!existsSync(templatePath)) {
    // biome-ignore lint/suspicious/noConsole: intentional CLI error output
    console.error(`Template file not found: ${templatePath}`)
    process.exitCode = 1
    return
  }

  // Parse and validate template phases
  const template = parseTemplateYaml(templatePath)
  if (!template?.phases?.length) {
    // biome-ignore lint/suspicious/noConsole: intentional CLI error output
    console.error(`No phases found in template: ${templatePath}`)
    // biome-ignore lint/suspicious/noConsole: intentional CLI error output
    console.error('Template must have YAML frontmatter with phases array')
    process.exitCode = 1
    return
  }

  // Validate phases
  const validationResult = validatePhases(template.phases, templatePath)
  if (!validationResult.valid) {
    // biome-ignore lint/suspicious/noConsole: intentional CLI error output
    console.error(formatValidationErrors(validationResult))
    process.exitCode = 1
    return
  }

  // Derive mode name from template filename or use provided mode arg
  const templateFilename = templatePath.split('/').pop()?.replace(/\.md$/, '') || 'custom'
  const modeName = parsed.mode || templateFilename

  const sessionId = parsed.session || (await getCurrentSessionId())
  const stateFile = await getStateFilePath(sessionId)

  let state: SessionState
  if (await stateExists(stateFile)) {
    state = await readState(stateFile)
  } else {
    state = createDefaultState(sessionId)
  }

  // Issue number from flag or state
  const issueNum = parsed.issue ?? state.issueNumber ?? undefined

  // Generate workflow ID
  const workflowPrefix = modeName.toUpperCase().slice(0, 2)
  let workflowId: string
  if (issueNum) {
    workflowId = generateWorkflowIdForIssue(issueNum)
  } else {
    workflowId = generateWorkflowId(workflowPrefix, sessionId)
  }

  const now = new Date().toISOString()
  const effectivePhases = template.phases.map((p) => p.id)

  const updated: SessionState = {
    ...state,
    sessionType: modeName,
    currentMode: modeName,
    template: templatePath,
    phases: effectivePhases,
    currentPhase: effectivePhases[0],
    workflowId,
    issueNumber: issueNum,
    modeHistory: [...(state.modeHistory || []), { mode: modeName, enteredAt: now }],
    modeState: {
      ...(state.modeState || {}),
      [modeName]: {
        status: 'active',
        enteredAt: now,
      },
    },
    updatedAt: now,
  }

  // --tmp marks this as a one-off session (still creates tasks and tracks state)
  const isTemporary = parsed.tmp === true

  // Create workflow directory for state tracking
  const workflowDir = join(dirname(stateFile), 'workflow')

  // Create native tasks from template phases (dry-run previews without persisting)
  if (!parsed.dryRun) {
    mkdirSync(workflowDir, { recursive: true })
  }
  const tasks = buildPhaseTasks(templatePath, workflowId, issueNum)
  let resolvedSubjects: string[] = []
  if (tasks.length > 0) {
    const { nativeTasks } = writeNativeTaskFiles(sessionId, tasks, workflowId, issueNum ?? null, parsed.dryRun)
    resolvedSubjects = nativeTasks.map((t) => t.subject)
  }

  const finalState: SessionState = {
    ...updated,
    workflowDir,
    // Mark as temporary/one-off session if --tmp flag was used
    ...(isTemporary && { isTemporary: true }),
  }

  if (!parsed.dryRun) {
    await writeState(stateFile, finalState)

    // Create fd-notes.md for feature-documentation mode (interview context persistence)
    if (modeName === 'feature-documentation' || templatePath.includes('feature-documentation')) {
      const featureDocPath = (finalState as Record<string, unknown>).featureDocPath as
        | string
        | undefined
      const domain = (finalState as Record<string, unknown>).domain as string | undefined
      createFdNotesFile(stateFile, sessionId, featureDocPath, domain)
    }

    // Create doctrine-notes.md for doctrine mode (interview context persistence)
    if (modeName === 'doctrine' || templatePath.includes('doctrine')) {
      const targetLayer = (finalState as Record<string, unknown>).targetLayer as string | undefined
      const targetDoc = (finalState as Record<string, unknown>).targetDoc as string | undefined
      createDoctrineNotesFile(stateFile, sessionId, targetLayer, targetDoc)
    }
  }

  // Get phase titles for guidance
  const phaseTitles = template.phases
    .filter((p) => p.task_config?.title)
    .map((p) => ({
      id: p.id,
      title: p.task_config!.title,
    }))

  // Build guidance
  const guidance = buildWorkflowGuidance(workflowId, modeName, null, phaseTitles, undefined)

  // Warn if native tasks are disabled
  if (guidance.requiredTodos.length > 0 && !parsed.dryRun && !isNativeTasksEnabled()) {
    // biome-ignore lint/suspicious/noConsole: intentional CLI output
    console.error('⚠️  Native tasks disabled (CLAUDE_CODE_ENABLE_TASKS=false). TaskList will not work.')
  }

  const action = parsed.dryRun ? 'dry-run' : isTemporary ? 'started-temporary' : 'started'

  // Output rendered rules (replaces raw template dump)
  if (!parsed.dryRun) {
    const kataConfig = loadKataConfig()
    outputRules(modeName, workflowId, kataConfig.task_rules, issueNum, phaseTitles.length > 0)
  }

  // biome-ignore lint/suspicious/noConsole: intentional CLI output
  console.log(
    JSON.stringify({
      success: true,
      mode: modeName,
      workflowId,
      action,
      sessionType: modeName,
      template: templatePath,
      phases: effectivePhases,
      workflowDir,
      ...(parsed.dryRun && {
        dryRun: true,
        wouldCreateTasks: phaseTitles.length,
        pattern: `${phaseTitles.length} tasks from custom template`,
      }),
      enteredAt: finalState.updatedAt,
      ...(issueNum && { issueNumber: issueNum }),
      tasks: resolvedSubjects,
    }),
  )
}

/**
 * kata enter <mode> [--session=SESSION_ID]
 * Enter a mode, create state if needed
 */
export async function enter(args: string[]): Promise<void> {
  const parsed = parseArgs(args)

  // Handle custom template mode
  if (parsed.template) {
    return enterWithCustomTemplate(args, parsed)
  }

  // Session cleanup (before entering mode)
  if (!parsed.skipCleanup && !parsed.dryRun) {
    try {
      const { cleanupOldSessions } = await import('../utils/session-cleanup.js')
      const { loadKataConfig: loadCfg } = await import('../config/kata-config.js')
      const kataCfg = loadCfg()
      const retentionDays = kataCfg.session_retention_days
      const { getKataDir } = await import('../session/lookup.js')
      const projectRoot = findProjectDir()
      const claudeDir = join(projectRoot, getKataDir(projectRoot))
      const sessionId = parsed.session || (await getCurrentSessionId())
      cleanupOldSessions(claudeDir, retentionDays, sessionId)
    } catch {
      // Cleanup failure must not block mode entry
    }
  }

  if (!parsed.mode) {
    // biome-ignore lint/suspicious/noConsole: intentional CLI error output
    console.error('Usage: kata enter <mode> [--session=SESSION_ID] [--template=PATH]')
    // biome-ignore lint/suspicious/noConsole: intentional CLI error output
    console.error('')
    // biome-ignore lint/suspicious/noConsole: intentional CLI error output
    console.error('Options:')
    // biome-ignore lint/suspicious/noConsole: intentional CLI error output
    console.error('  --session=ID      Session ID to use')
    // biome-ignore lint/suspicious/noConsole: intentional CLI error output
    console.error('  --issue=NUM       Link to GitHub issue')
    // biome-ignore lint/suspicious/noConsole: intentional CLI error output
    console.error('  --template=PATH   Use custom template for one-off session')
    // biome-ignore lint/suspicious/noConsole: intentional CLI error output
    console.error('  --dry-run         Preview what would be created')
    process.exitCode = 1
    return
  }

  const config = loadKataConfig()
  const canonical = resolveKataModeAlias(config, parsed.mode)

  const modeConfig = config.modes[canonical]
  if (!modeConfig) {
    // biome-ignore lint/suspicious/noConsole: intentional CLI error output
    console.error(`Unknown mode: ${parsed.mode}`)
    // biome-ignore lint/suspicious/noConsole: intentional CLI error output
    console.error(`Available modes: ${Object.keys(config.modes).join(', ')}`)
    // biome-ignore lint/suspicious/noConsole: intentional CLI error output
    console.error('')
    // biome-ignore lint/suspicious/noConsole: intentional CLI error output
    console.error('Or use --template=PATH for a custom one-off session')
    process.exitCode = 1
    return
  }

  if (modeConfig.deprecated) {
    // biome-ignore lint/suspicious/noConsole: intentional CLI error output
    console.error(`Mode '${canonical}' is deprecated.`)
    if (modeConfig.redirect_to) {
      // biome-ignore lint/suspicious/noConsole: intentional CLI error output
      console.error(`Use '${modeConfig.redirect_to}' instead.`)
    }
    process.exitCode = 1
    return
  }

  // Parse template phases EARLY to drive behavior from structure (not mode names)
  // This enables template-driven behavior instead of hardcoded mode checks
  const templatePhases = modeConfig.template
    ? parseAndValidateTemplatePhases(modeConfig.template)
    : null
  const specExpansionPhase = templatePhases?.find((p) => p.expansion === 'spec')
  const hasSpecExpansion = specExpansionPhase !== undefined

  // Resolve subphase pattern: always an inline array now (string references removed)
  let resolvedSubphasePattern: SubphasePattern[] = []
  if (hasSpecExpansion && specExpansionPhase?.subphase_pattern) {
    resolvedSubphasePattern = specExpansionPhase.subphase_pattern  // always array now
  }

  // Validate gate placeholders — fail early if config is missing required fields
  if (templatePhases) {
    const placeholderCtx: PlaceholderContext = { config }
    const missing = validateGatePlaceholders(templatePhases, placeholderCtx)
    if (missing.length > 0) {
      process.stderr.write(`\nkata enter ${canonical}: missing config for gate placeholders:\n\n`)
      for (const key of missing) {
        process.stderr.write(`  - {${key}} → set \`${key}\` in kata.yaml project section\n`)
      }
      process.stderr.write(`\nGates cannot run without these values. Add them to .kata/kata.yaml:\n\n`)
      process.stderr.write(`  project:\n`)
      for (const key of missing) {
        process.stderr.write(`    ${key}: "your-command-here"\n`)
      }
      process.stderr.write(`\n`)
      process.exitCode = 1
      return
    }
  }

  // Validate ceremony.md exists in project
  const ceremonyPath = join(findProjectDir(), '.kata', 'ceremony.md')
  if (!existsSync(ceremonyPath)) {
    process.stderr.write(
      `\nkata enter ${canonical}: .kata/ceremony.md not found.\n` +
      `Run: kata update\n\n`,
    )
    process.exitCode = 1
    return
  }

  const sessionId = parsed.session || (await getCurrentSessionId())
  const stateFile = await getStateFilePath(sessionId)

  let state: SessionState
  if (await stateExists(stateFile)) {
    state = await readState(stateFile)
  } else {
    // Create default state if doesn't exist
    state = createDefaultState(sessionId)
  }

  // Determine issue number: --issue flag takes precedence, then session state
  const issueNum = parsed.issue ?? state.issueNumber ?? undefined

  // If --issue flag provided, update state with it
  if (parsed.issue && parsed.issue !== state.issueNumber) {
    // Warn about switching issues (helps user understand what's happening)
    if (state.issueNumber && state.currentMode && state.currentMode !== 'default') {
      // biome-ignore lint/suspicious/noConsole: intentional CLI output
      console.error(`⚠️  Switching from issue #${state.issueNumber} to #${parsed.issue}`)
      // biome-ignore lint/suspicious/noConsole: intentional CLI output
      console.error(`   Previous mode: ${state.currentMode}`)
      // biome-ignore lint/suspicious/noConsole: intentional CLI output
      console.error(
        `   Tip: Use 'kata exit' to cleanly close previous workflow, or 'kata init --force' to reset`,
      )
      // biome-ignore lint/suspicious/noConsole: intentional CLI output
      console.error('')
    }
    state.issueNumber = parsed.issue
  }

  // For modes with spec expansion phases (template-driven), try to load phases from spec
  // Spec expansion phase indicates spec phases should be inserted into template
  let specPhases: SpecPhase[] | null = null
  let specPath: string | null = null
  if (hasSpecExpansion && issueNum) {
    specPath = findSpecFile(issueNum)
    if (specPath) {
      const parseResult = parseYamlFrontmatterWithError<SpecYaml>(specPath)

      if (parseResult.ok && parseResult.data?.phases?.length) {
        specPhases = parseResult.data.phases

        // ENFORCEMENT: Check that at least one phase has tasks
        const totalTasks = specPhases.reduce((sum, p) => sum + (p.tasks?.length ?? 0), 0)
        if (totalTasks === 0) {
          printSpecError(canonical, specPath, issueNum, [
            `Phases found: ${specPhases.length}`,
            '',
            'PROBLEM: Phases exist but none have tasks defined.',
            'Each phase needs a "tasks" array with task descriptions.',
            '',
            ...specExampleLines(issueNum),
          ])
          process.exit(1)
        }
      } else {
        // ENFORCEMENT: Spec exists but has no valid phases - fail with clear error
        const problemLines: string[] = []
        if (!parseResult.ok) {
          problemLines.push('PROBLEM: Failed to parse YAML frontmatter.')
          problemLines.push('')
          problemLines.push(`Parse error: ${parseResult.error}`)
        } else {
          problemLines.push('PROBLEM: Spec has no "phases" section in YAML frontmatter.')
        }
        problemLines.push('')
        problemLines.push('Modes with spec expansion phases require specs to define phases like:')
        problemLines.push('')
        problemLines.push(...specExampleLines(issueNum))

        printSpecError(canonical, specPath, issueNum, problemLines)
        process.exit(1)
      }
    } else {
      // ENFORCEMENT: No spec found for this issue — fail with clear error
      process.stderr.write(`\nkata enter ${canonical}: no spec found for issue #${issueNum}\n\n`)
      process.stderr.write(`  Searched: ${config.spec_path ?? 'planning/specs'}/\n`)
      process.stderr.write(`  Expected: a file matching issue number ${issueNum}\n\n`)
      process.stderr.write(`  Create a spec first with: kata enter planning --issue=${issueNum}\n\n`)
      process.exit(1)
    }
  }

  // Check if already in this mode (resume vs fresh start)
  const isAlreadyInMode = state.currentMode === canonical

  // Use issue-based workflow ID if linked to an issue (persists across sessions)
  // Otherwise use existing workflow ID if resuming, or generate new if fresh start
  let workflowId: string
  if (issueNum) {
    // Issue-based: always use GH#X (persists across sessions)
    workflowId = generateWorkflowIdForIssue(issueNum)
  } else if (isAlreadyInMode && state.workflowId) {
    // Resuming same mode: keep existing workflow ID
    workflowId = state.workflowId
  } else {
    // Fresh start: generate new session-based ID
    workflowId = generateWorkflowId(
      modeConfig.workflow_prefix || canonical.toUpperCase().slice(0, 2),
      sessionId,
    )
  }

  const now = new Date().toISOString()

  // Determine phases to use: spec phases first, then template phases, then modes.yaml fallback
  const effectivePhases = specPhases
    ? specPhases.map((p) => p.id)
    : (templatePhases?.map((p) => p.id) ?? [])

  const updated: SessionState = {
    ...state,
    sessionType: canonical,
    currentMode: canonical,
    template: modeConfig.template,
    phases: effectivePhases,
    currentPhase: effectivePhases[0],
    workflowId,
    issueNumber: issueNum,
    specPath: specPath ?? undefined,
    modeHistory: [...(state.modeHistory || []), { mode: canonical, enteredAt: now }],
    modeState: {
      ...(state.modeState || {}),
      [canonical]: {
        status: 'active',
        enteredAt: now,
      },
    },
    updatedAt: now,
  }

  // Create workflow directory for state tracking
  const workflowDir = join(dirname(stateFile), 'workflow')

  // Build reviewers string for {reviewers} placeholder in review step titles
  // Computed here so it can be used by both spec-based and template-only task builders
  const reviews = config.reviews
  const externalProviders =
    reviews?.code_review !== false
      ? (reviews?.code_reviewers ?? (reviews?.code_reviewer ? [reviews.code_reviewer] : []))
      : []
  // Read reviewer_prompt from template frontmatter (default: 'code-review')
  const reviewerPrompt = modeConfig.template ? getTemplateReviewerPrompt(modeConfig.template) : 'code-review'
  const reviewerParts = [
    'Invoke /code-review',
    ...externalProviders.filter(Boolean).map((p) => `kata review --prompt=${reviewerPrompt} --provider=${p}`),
  ]
  const reviewers = reviewerParts.join(', ')

  // Build tasks (always, even for dry-run — so subjects can be included in output)
  let allTasks: Task[] = []

  if (hasSpecExpansion && specPhases && issueNum) {
    const specExpansionPhaseNum = specExpansionPhase
      ? Number.parseInt(specExpansionPhase.id.replace('p', ''), 10)
      : 2

    // Create BOTH orchestration tasks (P0, P1, P3, P4, ...) AND spec subphase tasks (P2.X)
    const orchTasks = modeConfig.template
      ? buildPhaseTasks(modeConfig.template, workflowId, issueNum, reviewers)
      : []
    // Read spec file content for VP extraction (used by {verification_plan} placeholder)
    const specContent = specPath ? readFileSync(specPath, 'utf-8') : undefined

    let specTasks: Task[]

    if (resolvedSubphasePattern.length > 0) {
      // Fan-out: IMPL/TEST/REVIEW subtasks per spec phase (legacy subphase_pattern)
      specTasks = buildSpecTasks(specPhases, issueNum, resolvedSubphasePattern, specExpansionPhaseNum, specContent, reviewers, specExpansionPhase?.skill)
    } else {
      // Single task per spec phase — skill + gate on the phase
      specTasks = []
      for (let i = 0; i < specPhases.length; i++) {
        const phase = specPhases[i]
        const phaseNum = i + 1
        const phaseName = phase.name || phase.id.toUpperCase()
        const phaseLabel = `P${specExpansionPhaseNum}.${phaseNum}`
        const taskSummary = phase.tasks?.length
          ? (phase.tasks.length === 1 ? phase.tasks[0] : `${phase.tasks[0]} + ${phase.tasks.length - 1} more`)
          : phaseName

        // biome-ignore lint/suspicious/noConsole: intentional CLI output
        console.error(`  ${phaseLabel}: ${phaseName}`)

        let instruction = specExpansionPhase?.task_config?.instruction ?? 'Implement this spec phase.'
        if (specExpansionPhase?.skill) {
          instruction = `Invoke /${specExpansionPhase.skill}\n\n${instruction}`
        }

        const taskId = `p${specExpansionPhaseNum}.${phaseNum}`
        const prevId = phaseNum > 1 ? `p${specExpansionPhaseNum}.${phaseNum - 1}` : undefined

        specTasks.push({
          id: taskId,
          title: `GH#${issueNum}: ${phaseLabel}: ${taskSummary}`,
          done: false,
          depends_on: prevId ? [prevId] : [],
          completedAt: null,
          reason: null,
          instruction,
        })
      }
    }

      // Wire cross-phase dependencies:
      // - First spec task depends on last task of P1 (Claim)
      const firstSpecTaskId = resolvedSubphasePattern.length > 0
        ? `p${specExpansionPhaseNum}.1:${resolvedSubphasePattern[0]?.id_suffix ?? 'impl'}`
        : `p${specExpansionPhaseNum}.1`
      const firstSpec = specTasks.find((t) => t.id === firstSpecTaskId)
      const lastP1TaskId = [...orchTasks]
        .filter((t) => t.id === 'p1' || t.id.startsWith('p1:'))
        .pop()?.id
      if (firstSpec && lastP1TaskId) {
        firstSpec.depends_on.push(lastP1TaskId)
      }

      // - First task after spec expansion (P3) depends on last spec task
      const lastSpecTaskId = resolvedSubphasePattern.length > 0
        ? `p${specExpansionPhaseNum}.${specPhases.length}:${resolvedSubphasePattern[resolvedSubphasePattern.length - 1]?.id_suffix ?? 'verify'}`
        : `p${specExpansionPhaseNum}.${specPhases.length}`
      const firstP3Task = orchTasks.find((t) => t.id === 'p3' || t.id.startsWith('p3:'))
      if (firstP3Task && specTasks.some((t) => t.id === lastSpecTaskId)) {
        firstP3Task.depends_on.push(lastSpecTaskId)
      }

      // Order: before-expansion (P0, P1), spec tasks (P2.X), after-expansion (P3, P4)
      const beforeExpansion = orchTasks.filter((t) => {
        const num = Number.parseInt(t.id.replace('p', ''), 10)
        return num < specExpansionPhaseNum
      })
      const afterExpansion = orchTasks.filter((t) => {
        const num = Number.parseInt(t.id.replace('p', ''), 10)
        return num >= specExpansionPhaseNum
      })
      allTasks = [...beforeExpansion, ...specTasks, ...afterExpansion]
    } else if (modeConfig.template) {
      allTasks = buildPhaseTasks(modeConfig.template, workflowId, issueNum, reviewers)
    }

  // Write native task files (dry-run previews without persisting)
  let resolvedSubjects: string[] = []
  if (allTasks.length > 0) {
    const { nativeTasks } = writeNativeTaskFiles(sessionId, allTasks, workflowId, issueNum ?? null, parsed.dryRun)
    resolvedSubjects = nativeTasks.map((t) => t.subject)
  }

  const finalState: SessionState = {
    ...updated,
    workflowDir,
  }

  // Skip state write in dry-run mode
  if (!parsed.dryRun) {
    await writeState(stateFile, finalState)
  }

  // Determine action taken (native tasks always recreate, so always 'started')
  const action = parsed.dryRun ? 'dry-run' : 'started'

  const wouldCreateTasks = allTasks.length

  // Get phase titles from template for guidance context
  const phaseTitles = modeConfig.template ? getPhaseTitlesFromTemplate(modeConfig.template) : []

  // Compute effective task_rules — agent-expanded phases allow TaskCreate
  const hasAgentExpansion = templatePhases?.some(p => p.expansion === 'agent') ?? false
  let effectiveTaskRules = config.task_rules
  if (hasAgentExpansion) {
    effectiveTaskRules = effectiveTaskRules.map(rule => {
      if (rule.includes('Do NOT create new tasks with TaskCreate')) {
        return 'Tasks are pre-created by kata enter. TaskCreate is allowed ONLY for phases marked as agent-expanded.'
      }
      if (rule.includes('Never use TaskCreate')) {
        return 'Use TaskUpdate to mark tasks in_progress/completed. Use TaskCreate only for agent-expanded phases.'
      }
      return rule
    })
  }

  // Build comprehensive workflow guidance with suggested todos
  // Now passes templatePhases for dynamic reading instead of hardcoding
  // task_system rules from global_behavior flow into stdout JSON for agent consumption
  const guidance = buildWorkflowGuidance(
    workflowId,
    canonical,
    specPhases,
    phaseTitles,
    templatePhases ?? undefined,
    effectiveTaskRules,
    resolvedSubphasePattern.length > 0 ? resolvedSubphasePattern : undefined,
  )

  // Warn if native tasks are disabled
  if (guidance.requiredTodos.length > 0 && !isAlreadyInMode && !parsed.dryRun && !isNativeTasksEnabled()) {
    // biome-ignore lint/suspicious/noConsole: intentional CLI output
    console.error('⚠️  Native tasks disabled (CLAUDE_CODE_ENABLE_TASKS=false). TaskList will not work.')
  }

  // Output rendered rules (replaces raw template dump)
  if (!parsed.dryRun) {
    outputRules(canonical, workflowId, effectiveTaskRules, issueNum, allTasks.length > 0)
  }

  // biome-ignore lint/suspicious/noConsole: intentional CLI output
  console.log(
    JSON.stringify(
      {
        success: true,
        mode: canonical,
        workflowId,
        action,
        sessionType: canonical,
        template: modeConfig.template,
        phases: effectivePhases,
        workflowDir,
        ...(parsed.dryRun && {
          dryRun: true,
          wouldCreateTasks,
          pattern:
            hasSpecExpansion && specPhases
              ? `${templatePhases?.filter((p) => !p.expansion && p.task_config?.title).length ?? 0} orchestration + ${specPhases.length} phases × ${resolvedSubphasePattern.length || 1} subphases = ${wouldCreateTasks} tasks`
              : `${wouldCreateTasks} tasks`,
        }),
        enteredAt: finalState.updatedAt,
        ...(specPath && { specPath, phasesFromSpec: true }),
        ...(issueNum && { issueNumber: issueNum }),
        tasks: allTasks.map((t) => t.title),
        // guidance contains requiredTodos, workflow steps, and commands
        guidance,
      },
      null,
      2,
    ),
  )
}

function specExampleLines(issueNum: number): string[] {
  return [
    '  ---',
    `  github_issue: ${issueNum}`,
    '  phases:',
    '    - id: p1',
    '      name: "Phase 1 Name"',
    '      tasks:',
    '        - "Task description"',
    '  ---',
  ]
}

function printSpecError(
  mode: string,
  specPath: string,
  issueNum: number,
  problemLines: string[],
): void {
  const bar = '═══════════════════════════════════════════════════════════════════════════════'
  // biome-ignore lint/suspicious/noConsole: intentional CLI output
  console.error('')
  // biome-ignore lint/suspicious/noConsole: intentional CLI output
  console.error(bar)
  // biome-ignore lint/suspicious/noConsole: intentional CLI output
  console.error(`🛑 SPEC VALIDATION FAILED: Cannot enter ${mode} mode`)
  // biome-ignore lint/suspicious/noConsole: intentional CLI output
  console.error(bar)
  // biome-ignore lint/suspicious/noConsole: intentional CLI output
  console.error('')
  // biome-ignore lint/suspicious/noConsole: intentional CLI output
  console.error(`Spec file found: ${specPath}`)
  // biome-ignore lint/suspicious/noConsole: intentional CLI output
  console.error('')
  for (const line of problemLines) {
    // biome-ignore lint/suspicious/noConsole: intentional CLI output
    console.error(line)
  }
  // biome-ignore lint/suspicious/noConsole: intentional CLI output
  console.error('')
  // biome-ignore lint/suspicious/noConsole: intentional CLI output
  console.error('TO FIX:')
  // biome-ignore lint/suspicious/noConsole: intentional CLI output
  console.error('  1. Fix the spec YAML frontmatter')
  // biome-ignore lint/suspicious/noConsole: intentional CLI output
  console.error(`  2. Run: kata validate-spec ${specPath}`)
  // biome-ignore lint/suspicious/noConsole: intentional CLI output
  console.error(`  3. Then retry: kata enter ${mode} --issue=${issueNum}`)
  // biome-ignore lint/suspicious/noConsole: intentional CLI output
  console.error('')
  // biome-ignore lint/suspicious/noConsole: intentional CLI output
  console.error(bar)
}
