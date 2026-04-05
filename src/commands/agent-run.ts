/**
 * kata agent-run — general-purpose agent execution via provider.
 *
 * Unified CLI for running any agent task: reviews, code generation, analysis, etc.
 * Exposes the full AgentRunOptions surface through CLI flags.
 *
 * Usage:
 *   kata agent-run --prompt=code-review                         # Text-only review
 *   kata agent-run --prompt=code-review --tools=Read,Grep       # With specific tools
 *   kata agent-run --prompt=refactor --yolo                     # All tools, no restrictions
 *   kata agent-run --prompt=code-review --provider=gemini       # Alt provider
 *   kata agent-run --prompt=code-review --model=claude-haiku-4-5
 *   kata agent-run --prompt=code-review --max-turns=10
 *   kata agent-run --prompt=code-review --timeout=600
 *   kata agent-run --prompt=code-review --output=reviews/       # Save artifact
 *   kata agent-run --prompt=code-review --context=git_diff      # Add context
 *   kata agent-run --prompt=code-review --dry-run               # Show config
 *   kata agent-run --list                                       # List prompts
 *   kata agent-run --list-tools                                 # List canonical tool names
 *
 * Tool names use Claude Code canonical names (Read, Edit, Write, Bash, etc.).
 * Provider support varies:
 *   claude:  per-tool filtering, text-only mode, maxTurns
 *   gemini:  all-or-nothing (--yolo), no per-tool filtering
 *   codex:   all-or-nothing (bypass), no per-tool filtering
 */

import { runAgentStep } from '../providers/step-runner.js'
import { listPrompts } from '../providers/prompt.js'
import { getProvider } from '../providers/index.js'
import { findProjectDir } from '../session/lookup.js'
import { CANONICAL_TOOLS } from '../providers/types.js'

interface AgentRunArgs {
  prompt?: string
  custom?: string
  provider: string
  model?: string
  output?: string
  context: string[]
  allowedTools?: string[]
  maxTurns?: number
  timeout?: number
  gate: boolean
  threshold?: number
  dryRun: boolean
  list: boolean
  listTools: boolean
}

function parseAgentRunArgs(args: string[]): AgentRunArgs {
  const result: AgentRunArgs = {
    provider: 'claude',
    context: [],
    gate: false,
    dryRun: false,
    list: false,
    listTools: false,
  }

  for (const arg of args) {
    if (arg === '--list') {
      result.list = true
    } else if (arg === '--list-tools') {
      result.listTools = true
    } else if (arg === '--dry-run') {
      result.dryRun = true
    } else if (arg === '--gate') {
      result.gate = true
    } else if (arg === '--yolo') {
      result.allowedTools = ['all']
    } else if (arg.startsWith('--prompt=')) {
      result.prompt = arg.split('=')[1]
    } else if (arg.startsWith('--custom=')) {
      result.custom = arg.slice('--custom='.length)
    } else if (arg.startsWith('--provider=')) {
      result.provider = arg.split('=')[1]
    } else if (arg.startsWith('--model=')) {
      result.model = arg.split('=')[1]
    } else if (arg.startsWith('--output=')) {
      result.output = arg.split('=')[1]
    } else if (arg.startsWith('--context=')) {
      result.context.push(arg.split('=')[1])
    } else if (arg.startsWith('--tools=')) {
      const val = arg.split('=')[1]
      result.allowedTools = val === 'all' ? ['all'] : val.split(',')
    } else if (arg.startsWith('--max-turns=')) {
      result.maxTurns = Number.parseInt(arg.split('=')[1], 10)
    } else if (arg.startsWith('--timeout=')) {
      result.timeout = Number.parseInt(arg.split('=')[1], 10)
    } else if (arg.startsWith('--threshold=')) {
      result.threshold = Number.parseInt(arg.split('=')[1], 10)
    }
  }

  return result
}

function formatTools(tools?: string[]): string {
  if (!tools?.length) return '(none — text-only)'
  if (tools.length === 1 && tools[0] === 'all') return 'all (yolo)'
  return tools.join(', ')
}

export async function agentRun(args: string[]): Promise<void> {
  const parsed = parseAgentRunArgs(args)

  // --list: show available prompt templates
  if (parsed.list) {
    const prompts = listPrompts()
    // biome-ignore lint/suspicious/noConsole: intentional CLI output
    console.log('Available prompt templates:')
    for (const name of prompts) {
      // biome-ignore lint/suspicious/noConsole: intentional CLI output
      console.log(`  ${name}`)
    }
    return
  }

  // --list-tools: show canonical tool names with provider support
  if (parsed.listTools) {
    // biome-ignore lint/suspicious/noConsole: intentional CLI output
    console.log('Canonical tool names (kata uses Claude Code names):')
    for (const tool of CANONICAL_TOOLS) {
      // biome-ignore lint/suspicious/noConsole: intentional CLI output
      console.log(`  ${tool}`)
    }
    // biome-ignore lint/suspicious/noConsole: intentional CLI output
    console.log('\nSpecial values:')
    // biome-ignore lint/suspicious/noConsole: intentional CLI output
    console.log('  all     Give all available tools (--yolo)')
    // biome-ignore lint/suspicious/noConsole: intentional CLI output
    console.log('\nProvider support:')
    // biome-ignore lint/suspicious/noConsole: intentional CLI output
    console.log('  claude   Per-tool filtering, text-only mode, maxTurns')
    // biome-ignore lint/suspicious/noConsole: intentional CLI output
    console.log('  gemini   All-or-nothing (always --yolo), no per-tool filtering')
    // biome-ignore lint/suspicious/noConsole: intentional CLI output
    console.log('  codex    All-or-nothing (always bypass), no per-tool filtering')
    return
  }

  if (!parsed.prompt && !parsed.custom) {
    // biome-ignore lint/suspicious/noConsole: intentional CLI output
    console.error(`Usage: kata agent-run --prompt=<name> [options]
       kata agent-run --custom="<inline prompt>" [options]

Options:
  --prompt=<name>        Prompt template name (loads from .kata/prompts/)
  --custom=<text>        Inline prompt text (alternative to --prompt)
  --provider=<name>      Provider: claude, gemini, codex (default: claude)
  --model=<model>        Override provider's default model
  --tools=<t1,t2,...>    Tools: specific names, or 'all' (default: none = text-only)
  --yolo                 Shorthand for --tools=all (all tools, no restrictions)
  --max-turns=<n>        Max agentic turns (default: 3)
  --timeout=<seconds>    Execution timeout in seconds (default: 300)
  --context=<source>     Context source (repeatable): git_diff, spec, template, file:<path>
  --output=<path>        Save output artifact to path ({date} supported)
  --gate                 Enable score gating (blocks if score < threshold)
  --threshold=<n>        Min score to pass gate (default: 75)
  --dry-run              Show assembled config without running
  --list                 List available prompt templates
  --list-tools           List canonical tool names and provider support`)
    process.exitCode = 1
    return
  }

  if (parsed.prompt && parsed.custom) {
    // biome-ignore lint/suspicious/noConsole: intentional CLI output
    console.error('Error: --prompt and --custom are mutually exclusive. Use one or the other.')
    process.exitCode = 1
    return
  }

  let cwd: string
  try {
    cwd = findProjectDir()
  } catch {
    cwd = process.cwd()
  }

  if (parsed.dryRun) {
    // Show provider capabilities in dry-run
    let caps = ''
    try {
      const provider = getProvider(parsed.provider)
      const c = provider.capabilities
      caps = ` [tools: ${c.toolFiltering ? 'per-tool' : 'all-or-nothing'}, text-only: ${c.textOnly ? 'yes' : 'no'}]`
    } catch { /* ignore */ }

    // biome-ignore lint/suspicious/noConsole: intentional CLI output
    console.log(`Provider:  ${parsed.provider}${caps}`)
    // biome-ignore lint/suspicious/noConsole: intentional CLI output
    console.log(`Model:     ${parsed.model ?? '(default)'}`)
    // biome-ignore lint/suspicious/noConsole: intentional CLI output
    console.log(`Prompt:    ${parsed.custom ? `(custom) ${parsed.custom.slice(0, 80)}${parsed.custom.length > 80 ? '...' : ''}` : parsed.prompt}`)
    // biome-ignore lint/suspicious/noConsole: intentional CLI output
    console.log(`Context:   ${parsed.context.join(', ') || '(none)'}`)
    // biome-ignore lint/suspicious/noConsole: intentional CLI output
    console.log(`Tools:     ${formatTools(parsed.allowedTools)}`)
    // biome-ignore lint/suspicious/noConsole: intentional CLI output
    console.log(`Max turns: ${parsed.maxTurns ?? 3}`)
    // biome-ignore lint/suspicious/noConsole: intentional CLI output
    console.log(`Timeout:   ${parsed.timeout ?? 300}s`)
    // biome-ignore lint/suspicious/noConsole: intentional CLI output
    console.log(`Gate:      ${parsed.gate ? `yes (threshold: ${parsed.threshold ?? 75})` : 'no'}`)
    // biome-ignore lint/suspicious/noConsole: intentional CLI output
    console.log(`Output:    ${parsed.output ?? '(stdout only)'}`)
    // biome-ignore lint/suspicious/noConsole: intentional CLI output
    console.log(`CWD:       ${cwd}`)
    return
  }

  const promptLabel = parsed.custom ? '(custom)' : parsed.prompt
  // biome-ignore lint/suspicious/noConsole: intentional CLI output
  console.error(`Running ${promptLabel} via ${parsed.provider} (tools: ${formatTools(parsed.allowedTools)})...`)

  const result = await runAgentStep(
    {
      provider: parsed.provider,
      model: parsed.model,
      prompt: parsed.prompt ?? '__custom__',
      raw_prompt: parsed.custom,
      context: parsed.context.length > 0 ? parsed.context : undefined,
      output: parsed.output,
      allowed_tools: parsed.allowedTools,
      max_turns: parsed.maxTurns,
      timeout: parsed.timeout,
    },
    { cwd },
  )

  // Output the result
  process.stdout.write(result.output + '\n')

  if (result.score !== undefined) {
    // biome-ignore lint/suspicious/noConsole: intentional CLI output
    console.error(`Score: ${result.score}/100`)
  }
  if (result.artifactPath) {
    // biome-ignore lint/suspicious/noConsole: intentional CLI output
    console.error(`Saved: ${result.artifactPath}`)
  }
  if (parsed.gate && !result.passed) {
    // biome-ignore lint/suspicious/noConsole: intentional CLI output
    console.error(`Gate FAILED: score ${result.score ?? '?'} < threshold ${parsed.threshold ?? 75}`)
    process.exitCode = 1
  }
}
