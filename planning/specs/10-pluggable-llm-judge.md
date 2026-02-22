---
initiative: pluggable-llm-judge
type: project
issue_type: feature
status: approved
priority: medium
github_issue: 10
created: 2026-02-22
updated: 2026-02-22
phases:
  - id: p1
    name: "Provider interface and Claude adapter"
    tasks:
      - "Define JudgeProvider interface"
      - "Extract Claude adapter from existing judge.ts"
      - "Add provider registry and factory"
      - "Wire --judge flag to accept provider name"
  - id: p2
    name: "Gemini and Codex adapters"
    tasks:
      - "Implement Gemini provider (CLI wrapper)"
      - "Implement Codex provider (CLI wrapper with JSONL parsing)"
      - "Add model selection per provider"
  - id: p3
    name: "Integration and testing"
    tasks:
      - "Update harness to pass provider through"
      - "Update run.ts CLI flags"
      - "Add unit tests for score extraction and provider dispatch"
---

# Pluggable LLM-as-Judge

> GitHub Issue: [#10](https://github.com/codevibesmatter/kata-wm/issues/10)

## Overview

The eval harness judge is hardcoded to Claude SDK's `query()`. This feature extracts the judge behind a `JudgeProvider` interface so any agent CLI (Claude, Gemini, Codex) can serve as judge — with full agent capabilities (tool use, file access, reasoning), not just text generation. The baseplane `agent-tools` package already has working Gemini and Codex CLI wrappers that we'll adapt.

## Feature Behaviors

### B1: Provider interface

**Core:**
- **ID:** judge-provider-interface
- **Trigger:** Developer imports judge provider types
- **Expected:** A `JudgeProvider` interface exists with `judge(prompt, options) → string` that all providers implement. Each provider runs the judge prompt through its respective agent CLI with full capabilities.
- **Verify:** TypeScript compiles, all three providers satisfy the interface
- **Source:** eval/judge.ts (refactor), new eval/providers/*.ts

#### UI Layer
N/A — CLI only.

#### API Layer
```typescript
interface JudgeProvider {
  name: string                        // 'claude' | 'gemini' | 'codex'
  defaultModel?: string               // provider-specific default (undefined = SDK default)
  judge(prompt: string, options: JudgeProviderOptions): Promise<string>
}

interface JudgeProviderOptions {
  cwd: string                         // working directory for agent
  model?: string                      // override default model
  env?: Record<string, string>        // clean environment (caller filters CLAUDECODE*/CLAUDE_* vars)
  timeoutMs?: number                  // max execution time (default: 300_000 = 5 min)
}
```

**Error handling contract:** Providers throw on failure (CLI not found, non-zero exit, timeout). The caller (`judgeTranscript`) wraps in try/catch — same as the existing harness pattern (harness.ts:409). Provider errors should include the provider name in the message for diagnostics. If a provider's CLI is not installed, it should fail fast with an install hint (e.g., "gemini CLI not found. Install: npm i -g @google/gemini-cli").

**Environment cleaning:** The caller builds the filtered env (stripping CLAUDECODE*, CLAUDE_CODE_ENTRYPOINT, CLAUDE_PROJECT_DIR) and passes it via `options.env`. Providers use it as-is.

```
```

#### Data Layer
N/A.

---

### B2: Claude provider (extract from existing)

**Core:**
- **ID:** claude-provider
- **Trigger:** `--judge` or `--judge=claude`
- **Expected:** Existing Claude SDK `query()` logic extracted into a provider that implements `JudgeProvider`. Behavior identical to current judge — uses `@anthropic-ai/claude-agent-sdk` `query()` with `allowedTools: []`, `maxTurns: 3`.
- **Verify:** Running `npm run eval -- --judge` produces a valid JudgeResult with scores and verdict (structurally equivalent to pre-refactor)

#### UI Layer
N/A.

#### API Layer
```typescript
// eval/providers/claude.ts
export const claudeProvider: JudgeProvider = {
  name: 'claude',
  defaultModel: undefined,  // SDK picks its own default model
  async judge(prompt, options) {
    // Existing query() logic from judge.ts
    // Returns concatenated text chunks
  }
}
```

#### Data Layer
N/A.

---

### B3: Gemini provider

**Core:**
- **ID:** gemini-provider
- **Trigger:** `--judge=gemini`
- **Expected:** Writes the judge prompt to a temp file, then spawns `gemini` CLI with the prompt file as context. Captures stdout as the review text. Uses `--yolo` for autonomous execution, `-m` for model selection. Temp file approach avoids OS argument length limits for large prompts. Based on pattern from `baseplane/packages/agent-tools/src/gemini/index.ts`.
- **Verify:** `npm run eval -- --judge=gemini --scenario=task-mode` produces a scored review

#### UI Layer
N/A.

#### API Layer
```typescript
// eval/providers/gemini.ts
export const geminiProvider: JudgeProvider = {
  name: 'gemini',
  defaultModel: 'gemini-2.5-pro',
  async judge(prompt, options) {
    // Write prompt to temp file, pass as file context
    // spawnSync('gemini', ['-m', model, '-p', 'Review this transcript', tempFile, '--yolo'])
    // Capture stdout via stdio: ['pipe', 'pipe', 'pipe']
    // Return stdout text, clean up temp file
  }
}
```

#### Data Layer
N/A.

---

### B4: Codex provider

**Core:**
- **ID:** codex-provider
- **Trigger:** `--judge=codex`
- **Expected:** Spawns `codex exec` with the judge prompt via stdin, parses JSONL output for agent messages. Uses `--sandbox read-only` since judge only reads transcripts. Based on pattern from `baseplane/packages/agent-tools/src/codex/runner.ts`.
- **Verify:** `npm run eval -- --judge=codex --scenario=task-mode` produces a scored review

#### UI Layer
N/A.

#### API Layer
```typescript
// eval/providers/codex.ts
export const codexProvider: JudgeProvider = {
  name: 'codex',
  defaultModel: 'gpt-5.2-codex',
  async judge(prompt, options) {
    // spawn('codex', ['exec', '--sandbox', 'read-only', '--json', '-'])
    // Parse JSONL stdout, extract agent_message content
    // Return concatenated agent messages
  }
}
```

#### Data Layer
N/A.

---

### B5: CLI flag and provider dispatch

**Core:**
- **ID:** cli-judge-flag
- **Trigger:** User passes `--judge`, `--judge=claude`, `--judge=gemini`, or `--judge=codex`
- **Expected:** `--judge` alone defaults to `claude` (backward compatible). `--judge=<name>` selects the provider. Unknown provider name exits with error listing available providers. Optional `--judge-model=<model>` overrides the provider's default model.
- **Verify:** `npm run eval -- --judge=gemini` uses Gemini; `--judge` uses Claude; `--judge=unknown` errors with list

#### UI Layer
Console output unchanged — still prints `Agent X/100 | System Y/100 | VERDICT`.

#### API Layer
```typescript
// eval/run.ts flag parsing — match exactly '--judge' or '--judge=<provider>'
const judgeArg = args.find(a => a === '--judge' || a.startsWith('--judge='))
// --judge → { enabled: true, provider: 'claude' }
// --judge=gemini → { enabled: true, provider: 'gemini' }
const judgeProvider = judgeArg?.includes('=') ? judgeArg.split('=')[1] : 'claude'
const judgeModelArg = args.find(a => a.startsWith('--judge-model='))?.split('=')[1]
```

#### Data Layer
N/A.

---

### B6: Provider registry

**Core:**
- **ID:** provider-registry
- **Trigger:** Judge initialization
- **Expected:** A simple registry maps provider names to implementations. New providers can be added by registering in a single place. No plugin system or dynamic loading — just a `Record<string, JudgeProvider>`.
- **Verify:** Adding a mock provider to the registry makes it selectable via `--judge=mock`

#### UI Layer
N/A.

#### API Layer
```typescript
// eval/providers/index.ts
import { claudeProvider } from './claude.js'
import { geminiProvider } from './gemini.js'
import { codexProvider } from './codex.js'

export const providers: Record<string, JudgeProvider> = {
  claude: claudeProvider,
  gemini: geminiProvider,
  codex: codexProvider,
}

export function getProvider(name: string): JudgeProvider {
  const p = providers[name]
  if (!p) throw new Error(`Unknown judge provider: ${name}. Available: ${Object.keys(providers).join(', ')}`)
  return p
}
```

#### Data Layer
N/A.

---

## Non-Goals

- No web API or HTTP provider support — CLI agents only
- No concurrent multi-judge (run multiple providers and compare) — future work
- No provider-specific prompt tuning — same prompt goes to all providers
- No dynamic plugin loading or config-file-based provider registration
- No Gemini/Codex SDK library integration — CLI wrappers only (matching baseplane patterns)

## Open Questions

- [x] Should judge providers have full agent capabilities or just text gen? → Full agent (user confirmed)
- [x] Should we add a `--judge-model` flag? → Yes, include it. Simple to add and useful for comparing models within a provider.

## Implementation Phases

### Phase 1: Provider interface and Claude adapter

Tasks:
- Define `JudgeProvider` interface and `JudgeProviderOptions` types in `eval/providers/types.ts`
- Extract Claude-specific logic from `eval/judge.ts` into `eval/providers/claude.ts`
- Create provider registry in `eval/providers/index.ts`
- Refactor `judgeTranscript()` to accept a `JudgeProvider` parameter
- Update harness to resolve provider and pass it through

test_cases:
- id: tc1
  description: "Existing --judge flag still works (backward compat)"
  command: "npm run eval -- --judge --scenario=task-mode"
  expected_exit: 0
- id: tc2
  description: "TypeScript compiles cleanly"
  command: "npm run typecheck"
  expected_exit: 0

Verification:
- `--judge` produces identical results to pre-refactor
- Types compile (`npm run typecheck`)

### Phase 2: Gemini and Codex adapters

Tasks:
- Implement `eval/providers/gemini.ts` — spawn `gemini` CLI, capture stdout
- Implement `eval/providers/codex.ts` — spawn `codex exec`, parse JSONL
- Register both in provider registry
- Add `--judge=<provider>` and `--judge-model=<model>` flag parsing to `eval/run.ts`

test_cases:
- id: tc1
  description: "Gemini provider selected via flag"
  command: "npm run eval -- --judge=gemini --scenario=task-mode"
  expected_exit: 0
- id: tc2
  description: "Codex provider selected via flag"
  command: "npm run eval -- --judge=codex --scenario=task-mode"
  expected_exit: 0
- id: tc3
  description: "Unknown provider errors with list"
  command: "npm run eval -- --judge=unknown --scenario=task-mode 2>&1 | grep 'Unknown judge provider'"
  expected_exit: 0

Verification:
- Each provider produces scored reviews
- Types compile (`npm run typecheck`)

### Phase 3: Integration and testing

Tasks:
- Add unit tests for score/verdict extraction (provider-agnostic)
- Add unit tests for provider registry dispatch
- Update `saveJudgeArtifact` JSON to include `provider` and `model` fields (additive-only — existing fields unchanged, backward compatible)
- Update console output to show which provider was used (e.g., `Judge [gemini]: Agent 85/100 ...`)

test_cases:
- id: tc1
  description: "Unit tests pass"
  command: "npm run build && npm test"
  expected_exit: 0
- id: tc2
  description: "Judge artifact JSON includes provider field"
  command: "npm run eval -- --judge=claude --scenario=task-mode && cat eval-reviews/*.json | grep provider"
  expected_exit: 0

Verification:
- All tests pass
- Artifacts include provenance (which provider judged)
- Types compile (`npm run typecheck`)
