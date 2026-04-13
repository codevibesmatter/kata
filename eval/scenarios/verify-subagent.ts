/**
 * Standalone Verify Mode — enter verify mode and execute VP steps
 *
 * Tests the standalone verify mode (kata enter verify) instead of the
 * removed verify-run subagent. Fixture is pre-built with a working
 * health endpoint so the agent's only job is to enter verify mode,
 * execute VP steps, and write evidence.
 *
 * Asserts:
 * 1. Agent entered verify mode (session state)
 * 2. Verification evidence file written
 * 3. All VP steps passed in the evidence
 */

import type { EvalScenario } from '../harness.js'
import { assertVerifyEvidenceExists } from '../assertions.js'
import type { EvalCheckpoint, EvalContext } from '../harness.js'

// ─── Pre-built implementation files ─────────────────────────────────────────

const HEALTH_TS = `const startTime = Date.now()

export function getHealthResponse(): Response {
  const uptimeSeconds = Math.floor((Date.now() - startTime) / 1000)
  const body = {
    status: 'ok' as const,
    timestamp: new Date().toISOString(),
    uptime_seconds: uptimeSeconds,
  }
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}
`

const SERVER_TS = `import {
  createStartHandler,
  defaultStreamHandler,
} from '@tanstack/react-start/server'
import { getHealthResponse } from './api/health'

const startHandler = createStartHandler(defaultStreamHandler)

export default {
  async fetch(request: Request) {
    const url = new URL(request.url)
    if (url.pathname === '/api/health') {
      return getHealthResponse()
    }
    return startHandler(request)
  },
}
`

const HEALTH_TEST_TS = `import { describe, it, expect } from 'vitest'
import { getHealthResponse } from './health'

describe('GET /api/health', () => {
  it('returns 200 with status ok and valid timestamp', async () => {
    const response = getHealthResponse()
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.status).toBe('ok')
    const parsed = new Date(body.timestamp)
    expect(parsed.toISOString()).toBe(body.timestamp)
  })

  it('includes uptime_seconds as non-negative integer', async () => {
    const body = await getHealthResponse().json()
    expect(typeof body.uptime_seconds).toBe('number')
    expect(body.uptime_seconds).toBeGreaterThanOrEqual(0)
    expect(Number.isInteger(body.uptime_seconds)).toBe(true)
  })

  it('uptime_seconds is non-decreasing across calls', async () => {
    const a = await getHealthResponse().json()
    const b = await getHealthResponse().json()
    expect(b.uptime_seconds).toBeGreaterThanOrEqual(a.uptime_seconds)
  })
})
`

const VERIFICATION_TOOLS_MD = `# Verification Tools

## Dev Server
- **Start:** \`npm run dev\`
- **URL:** http://localhost:3000
- **Health:** http://localhost:3000 (check for 200)

## API
- **Base URL:** http://localhost:3000
- **Auth:** None required for health endpoint

## Key Endpoints
- GET /api/health — health check (status, timestamp, uptime_seconds)
`

// ─── Assertions ─────────────────────────────────────────────────────────────

function assertEvidenceAllPassed(issueNumber: number): EvalCheckpoint {
  return {
    name: `evidence for issue #${issueNumber} has all steps passed`,
    assert(ctx: EvalContext) {
      const base = '.kata/verification-evidence'
      let files: string[]
      try {
        files = ctx.listDir(base)
      } catch {
        return `No evidence file found for issue #${issueNumber}`
      }
      // Match vp-p1-100.json, vp-100.json, vp-task-100.json, etc.
      const matching = files.filter((f) => f.endsWith('.json') && f.includes(`-${issueNumber}.json`))
      for (const file of matching) {
        try {
          const evidence = JSON.parse(ctx.readFile(`${base}/${file}`)) as {
            steps: Array<{ id: string; status: string; passed?: boolean }>
            allStepsPassed?: boolean
          }
          const allPassed =
            evidence.allStepsPassed ??
            evidence.steps.every((s) => s.status === 'pass' || s.passed === true)
          if (!allPassed) {
            const failed = evidence.steps.filter((s) => s.status !== 'pass' && s.passed !== true)
            return `VP steps failed in ${file}: ${failed.map((s) => s.id).join(', ')}`
          }
          return null
        } catch (err) {
          return `Failed to parse evidence ${file}: ${err}`
        }
      }
      return `No evidence file found for issue #${issueNumber}`
    },
  }
}

function assertVerifyModeEntered(): EvalCheckpoint {
  return {
    name: 'agent entered verify mode',
    assert(ctx: EvalContext) {
      const sessions = ctx.listDir('.kata/sessions')
      for (const sid of sessions) {
        try {
          const state = JSON.parse(ctx.readFile(`.kata/sessions/${sid}/state.json`))
          if (state.currentMode === 'verify') return null
        } catch {
          // skip
        }
      }
      return 'No session with currentMode=verify found'
    },
  }
}

// ─── Scenario ───────────────────────────────────────────────────────────────

export const verifySubagentScenario: EvalScenario = {
  id: 'verify-subagent',
  name: 'Standalone verify mode (focused)',
  fixture: 'tanstack-start',
  fixtureSetup: [
    // Pre-create implementation files so the health endpoint already works
    'mkdir -p src/api',
    `cat > src/api/health.ts << 'HEREDOC'\n${HEALTH_TS}HEREDOC`,
    `cat > src/server.ts << 'HEREDOC'\n${SERVER_TS}HEREDOC`,
    `cat > src/api/health.test.ts << 'HEREDOC'\n${HEALTH_TEST_TS}HEREDOC`,
    `cat > .kata/verification-tools.md << 'HEREDOC'\n${VERIFICATION_TOOLS_MD}HEREDOC`,
    // Commit the implementation so verify mode has something to check
    'git add -A && git commit -m "feat: add health endpoint"',
    // Verify the build works
    'npm run build 2>&1 | tail -5',
  ],
  prompt:
    'Enter verify mode with `kata enter verify --issue=100` and execute the Verification Plan ' +
    'for the health endpoint. The spec is at planning/specs/100-health-endpoint.md. ' +
    'Execute all VP steps, write evidence, and report results.',
  timeoutMs: 10 * 60 * 1000,
  checkpoints: [
    assertVerifyModeEntered(),
    assertVerifyEvidenceExists(100),
    assertEvidenceAllPassed(100),
  ],
}
