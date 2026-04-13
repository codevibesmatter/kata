// kata test-baseline — capture and compare test failure baselines
// Solves the "pre-existing failures block phase gates" problem.
import { execSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { loadKataConfig } from '../config/kata-config.js'
import { findProjectDir, getSessionsDir, getCurrentSessionId } from '../session/lookup.js'

interface TestBaseline {
  timestamp: string
  command: string
  exitCode: number
  failCount: number
  output: string
}

function getBaselinePath(sessionId: string): string {
  const projectDir = findProjectDir()
  return join(getSessionsDir(projectDir), sessionId, 'test-baseline.json')
}

/**
 * Parse failure count from test runner output.
 * Supports common patterns: "X failed", "X fail", "failures: X", "X failing"
 */
function parseFailCount(output: string, exitCode: number): number {
  if (exitCode === 0) return 0

  // Try common patterns
  const patterns = [
    /(\d+)\s+fail/i,           // "15 fail", "3 failed", "2 failing"
    /failures?:\s*(\d+)/i,     // "failures: 5", "Failures: 3"
    /(\d+)\s+error/i,          // "1 error"
  ]

  for (const pattern of patterns) {
    const match = output.match(pattern)
    if (match) return parseInt(match[1], 10)
  }

  // If tests failed but we can't parse count, return -1 (unknown)
  return exitCode !== 0 ? -1 : 0
}

/**
 * kata test-baseline save [--session=ID]
 * Run tests and save the failure count as baseline.
 */
async function saveBaseline(sessionId: string): Promise<void> {
  const config = loadKataConfig()
  const testCommand = config.project?.test_command
  if (!testCommand) {
    process.stderr.write('No test_command configured in kata.yaml\n')
    process.exitCode = 1
    return
  }

  process.stdout.write(`Running baseline: ${testCommand}\n`)

  let output = ''
  let exitCode = 0
  try {
    const cwd = findProjectDir()
    output = execSync(testCommand, {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 120000,
      cwd,
    })
  } catch (err: unknown) {
    const execErr = err as { status?: number; stdout?: Buffer | string; stderr?: Buffer | string }
    exitCode = execErr.status ?? 1
    output = [execErr.stdout, execErr.stderr].filter(Boolean).map(s => s!.toString()).join('\n')
  }

  const failCount = parseFailCount(output, exitCode)

  const baseline: TestBaseline = {
    timestamp: new Date().toISOString(),
    command: testCommand,
    exitCode,
    failCount,
    output: output.slice(-2000), // Keep last 2000 chars
  }

  const baselinePath = getBaselinePath(sessionId)
  mkdirSync(join(baselinePath, '..'), { recursive: true })
  writeFileSync(baselinePath, JSON.stringify(baseline, null, 2))

  if (failCount > 0) {
    process.stdout.write(`Baseline saved: ${failCount} pre-existing failure(s)\n`)
  } else if (failCount === -1) {
    process.stdout.write(`Baseline saved: tests failed (exit ${exitCode}) but could not parse failure count\n`)
  } else {
    process.stdout.write('Baseline saved: all tests passing\n')
  }
}

/**
 * kata test-baseline check [--session=ID]
 * Run tests and compare against saved baseline.
 * Exits 0 if no NEW failures (same or fewer than baseline).
 * Exits 1 if new failures were introduced.
 */
async function checkBaseline(sessionId: string): Promise<void> {
  const baselinePath = getBaselinePath(sessionId)
  if (!existsSync(baselinePath)) {
    // No baseline saved — fall back to running the test command directly.
    // This handles sessions started before test-baseline was introduced,
    // or when P0 setup was skipped/didn't save a baseline.
    process.stderr.write('No test baseline found — falling back to running tests directly\n')
    const config = loadKataConfig()
    const cmd = config.project?.test_command_changed ?? config.project?.test_command
    if (!cmd) {
      process.stdout.write('No test command configured — passing\n')
      process.exitCode = 0
      return
    }
    try {
      const cwd = findProjectDir()
      execSync(cmd, { encoding: 'utf-8', stdio: 'inherit', timeout: 120000, cwd })
      process.exitCode = 0
    } catch {
      process.exitCode = 1
    }
    return
  }

  const baseline = JSON.parse(readFileSync(baselinePath, 'utf-8')) as TestBaseline
  const config = loadKataConfig()
  const testCommand = config.project?.test_command
  if (!testCommand) {
    process.stderr.write('No test_command configured in kata.yaml\n')
    process.exitCode = 1
    return
  }

  let output = ''
  let exitCode = 0
  try {
    const cwd = findProjectDir()
    output = execSync(testCommand, {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 120000,
      cwd,
    })
  } catch (err: unknown) {
    const execErr = err as { status?: number; stdout?: Buffer | string; stderr?: Buffer | string }
    exitCode = execErr.status ?? 1
    output = [execErr.stdout, execErr.stderr].filter(Boolean).map(s => s!.toString()).join('\n')
  }

  const currentFails = parseFailCount(output, exitCode)

  // If baseline had unparseable count, fall back to exit code comparison
  if (baseline.failCount === -1 || currentFails === -1) {
    if (exitCode <= baseline.exitCode) {
      process.stdout.write(`Tests OK (exit ${exitCode} <= baseline exit ${baseline.exitCode})\n`)
      process.exitCode = 0
    } else {
      process.stdout.write(`Tests regressed (exit ${exitCode} > baseline exit ${baseline.exitCode})\n`)
      process.exitCode = 1
    }
    return
  }

  const newFails = currentFails - baseline.failCount
  if (newFails <= 0) {
    process.stdout.write(
      `No new failures (${currentFails} current vs ${baseline.failCount} baseline)\n`
    )
    process.exitCode = 0
  } else {
    process.stdout.write(
      `${newFails} NEW failure(s) introduced (${currentFails} current vs ${baseline.failCount} baseline)\n`
    )
    process.exitCode = 1
  }
}

/**
 * kata test-baseline <save|check> [--session=ID]
 */
export async function testBaseline(args: string[]): Promise<void> {
  const subcommand = args.find(a => !a.startsWith('--')) ?? 'check'
  const sessionArg = args.find(a => a.startsWith('--session='))
  const sessionId = sessionArg?.slice('--session='.length)
    || process.env.KATA_SESSION_ID
    || await getCurrentSessionId()

  switch (subcommand) {
    case 'save':
      await saveBaseline(sessionId)
      break
    case 'check':
      await checkBaseline(sessionId)
      break
    default:
      process.stderr.write(`Usage: kata test-baseline <save|check> [--session=ID]\n`)
      process.exitCode = 1
  }
}
