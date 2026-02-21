#!/usr/bin/env tsx
/**
 * Eval runner — entry point for kata-wm agentic eval suite.
 *
 * Usage:
 *   npm run eval                              # Run all scenarios
 *   npm run eval -- --scenario=task-mode
 *   npm run eval -- --scenario=planning-mode
 *   npm run eval -- --json                   # JSON output
 *   npm run eval -- --list                   # List available scenarios
 *   npm run eval -- --verbose                # Stream agent output in real time
 *   npm run eval -- --no-transcript          # Skip writing transcript files
 */

import { mkdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { dirname } from 'node:path'
import { runScenario, type EvalResult } from './harness.js'
import { taskModeScenario } from './scenarios/task-mode.js'
import { planningModeScenario } from './scenarios/planning-mode.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const TRANSCRIPT_DIR = resolve(__dirname, '../eval-transcripts')

// ─── Registry ─────────────────────────────────────────────────────────────────

const scenarios = [taskModeScenario, planningModeScenario]

// ─── CLI ──────────────────────────────────────────────────────────────────────

const args = process.argv.slice(2)
const jsonMode = args.includes('--json')
const listMode = args.includes('--list')
const verbose = args.includes('--verbose')
const noTranscript = args.includes('--no-transcript')
const scenarioArg = args.find((a) => a.startsWith('--scenario='))?.split('=')[1]

if (listMode) {
  console.log('Available scenarios:')
  for (const s of scenarios) {
    console.log(`  ${s.id.padEnd(24)} ${s.name}`)
  }
  process.exit(0)
}

// Agent SDK uses Claude Code's existing auth — no ANTHROPIC_API_KEY needed.

const toRun = scenarioArg
  ? scenarios.filter((s) => s.id === scenarioArg)
  : scenarios

if (toRun.length === 0) {
  process.stderr.write(`Unknown scenario: ${scenarioArg}\n`)
  process.stderr.write(`Available: ${scenarios.map((s) => s.id).join(', ')}\n`)
  process.exit(1)
}

if (!noTranscript) {
  mkdirSync(TRANSCRIPT_DIR, { recursive: true })
}

// ─── Run ──────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const results: EvalResult[] = []
  let overallPassed = true
  const runTs = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)

  for (const scenario of toRun) {
    if (!jsonMode) {
      process.stdout.write(`\n▶ Running: ${scenario.name} (${scenario.id})\n`)
    }

    const transcriptPath = noTranscript
      ? undefined
      : resolve(TRANSCRIPT_DIR, `${scenario.id}-${runTs}.jsonl`)

    if (transcriptPath && !jsonMode) {
      process.stdout.write(`  Transcript: ${transcriptPath}\n`)
    }

    const result = await runScenario(scenario, { verbose: verbose && !jsonMode, transcriptPath })
    results.push(result)

    if (!jsonMode) {
      printResult(result)
    }

    if (!result.passed) overallPassed = false
  }

  if (jsonMode) {
    console.log(JSON.stringify({ passed: overallPassed, results }, null, 2))
  } else {
    printSummary(results)
  }

  process.exit(overallPassed ? 0 : 1)
}

function printResult(result: EvalResult): void {
  const status = result.passed ? '✅ PASS' : '❌ FAIL'
  console.log(`${status} ${result.scenarioName}`)
  console.log(
    `   Turns: ${result.turns}  Tokens: ${result.inputTokens.toLocaleString()}in/${result.outputTokens.toLocaleString()}out  Duration: ${Math.round(result.durationMs / 1000)}s  Cost: $${result.costUsd.toFixed(4)}`,
  )

  for (const a of result.assertions) {
    const mark = a.passed ? '  ✓' : '  ✗'
    console.log(`${mark} ${a.name}`)
    if (!a.passed && a.error) {
      console.log(`    → ${a.error}`)
    }
  }

  if (result.transcriptPath) {
    console.log(`  📄 ${result.transcriptPath}`)
  }
}

function printSummary(results: EvalResult[]): void {
  const passed = results.filter((r) => r.passed).length
  const total = results.length
  const totalTokens = results.reduce((s, r) => s + r.inputTokens + r.outputTokens, 0)
  const totalMs = results.reduce((s, r) => s + r.durationMs, 0)
  const totalCost = results.reduce((s, r) => s + r.costUsd, 0)

  console.log(`\n${'─'.repeat(60)}`)
  console.log(`Results: ${passed}/${total} scenarios passed`)
  console.log(`Total tokens: ${totalTokens.toLocaleString()}`)
  console.log(`Total time: ${Math.round(totalMs / 1000)}s`)
  console.log(`Total cost: $${totalCost.toFixed(4)}`)

  if (passed < total) {
    const failed = results.filter((r) => !r.passed).map((r) => r.scenarioId)
    console.log(`Failed: ${failed.join(', ')}`)
  }
}

main().catch((err) => {
  process.stderr.write(`Fatal: ${err instanceof Error ? err.message : String(err)}\n`)
  process.exit(1)
})
