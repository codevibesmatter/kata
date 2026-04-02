# Research: Workflow-Driven Coding Architecture

**Date:** 2026-04-02
**Status:** Complete
**Question:** Why is kata-wm bolting on workflow management when baseplane already has the primitives for a proper workflow-driven coding system?

## TL;DR

kata-wm is a hook-passenger architecture that reimplements workflow primitives (DAG, typed steps, LLM judgment, state machines) poorly inside Claude Code's extension points. Baseplane already has a production-grade workflow engine with all these primitives. The path forward: **baseplane's workflow engine gets a `CCCodingRunStepType`** that dispatches coding tasks to the CC Gateway on VPS. Kata becomes unnecessary or reduces to a thin interactive CLI.

---

## The Architecture Gap

### What kata-wm does today

kata-wm is a **hook-based enforcement layer** on Claude Code. It:

1. **Injects context** via SessionStart hooks (re-injected on every compaction)
2. **Gates exits** via Stop hooks (checks tasks_complete, committed, pushed, etc.)
3. **Enforces task order** via PreToolUse hooks (blocks TaskUpdate if dependencies unmet)
4. **Threads session IDs** via regex string manipulation in Bash commands

Modes, phases, and tasks are defined in YAML frontmatter templates. Claude Code is the session host; kata is a passenger reacting to hook events.

### Where kata fights the grain

| Problem | Root Cause | Workaround |
|---------|-----------|-----------|
| Session ID threading | SDK doesn't auto-forward session ID | Regex injection into bash commands + env var fallback |
| Task enforcement | Native tasks don't block out-of-order completion | Hook-based validation (split across file metadata + hook logic) |
| Context injection | SessionStart is ephemeral, not system prompt | Re-inject at every boundary + persist state to disk |
| LLM judgment | No evaluation of work quality | Honor-system task completion, regex stop conditions |
| Variable resolution | Steps can't reference prior step outputs | None — no inter-step data flow |
| Compensation | No rollback on failure | None |
| Budget control | No cost tracking or limits | None |
| Durability | State lost on session end | JSON file, no crash recovery |

### What baseplane already has

| Primitive | Baseplane Implementation |
|-----------|------------------------|
| **Workflow DAG** | `WorkflowDAG` with topological sort, parallel batching, join semantics (all/any/majority) |
| **40+ typed step types** | `IStepType` with Zod config schemas, execution contracts, retry policies |
| **LLM judgment gates** | `AIDecideStepType` — multi-provider, confidence-based routing, fallback branches |
| **Deterministic rule gates** | `DecisionEngine` — DMN-style 3-tier evaluation (project → org → platform) |
| **Human approval gates** | `ApprovalStepType` with state tracking, escalation, notifications |
| **Typed variable resolution** | `{{steps.X.output.Y}}` template system with Zod-validated TypedStepResults |
| **Compensation/rollback** | Saga pattern — reverse-order compensation on workflow failure |
| **Durable execution** | Cloudflare Workflows `step.do()` — survives crashes, replays from checkpoint |
| **Execution context** | Rich typed context: secrets, permissions, checkpoint manager, DB access |
| **Budget tracking** | Tier-based spending limits with windowed queries |
| **Event triggers** | Email, webhook, schedule, entity events, manual, API call |
| **Execution tracking** | `workflow_executions` table with status, duration, input/output, trigger data |

### What the CC Gateway already provides

`baseplane-infra/packages/cc-gateway/` is an HTTP API for spawning Claude Code sessions on VPS:

- `POST /sessions` — Create session with prompt, worktree, model, permissions
- `POST /sessions/:id/message` — Resume session with new prompt
- `POST /sessions/:id/abort` — Cancel running session
- `GET /sessions/:id` — Get session status
- SSE streaming of all session events (assistant messages, tool use, results)
- Worktree isolation (6 dev worktrees: `baseplane-dev1..dev6`)
- State persistence for crash recovery
- One session per worktree (prevents file conflicts)

---

## Industry State of the Art (2026)

The industry has converged on a clear pattern:

### The orchestrator is NOT the LLM

> "The key shift from 2024 to 2026: the orchestrator is no longer the LLM. The LLM is a worker called by a deterministic workflow engine."

**Factory.ai**: Four-phase deterministic loop (Spec → Test → Implement → Verify). A "Delegator" agent plans but never touches code. "Executor" droids have narrow scopes. The orchestrator only advances when verification passes — checked by exit codes and test results, not chat output.

**OpenAI Codex**: Runs on **Temporal** in production. Each task gets its own Firecracker microVM pre-loaded with the repo. The workflow engine handles retries, checkpoints, and human review gates.

**OpenHands**: Event-sourced state model with immutable event logs. `LocalWorkspace` vs `RemoteWorkspace` abstraction — same agent code runs locally or in distributed containers.

### Two-layer quality gates

Every serious system uses a two-stage gate before advancing:

1. **Deterministic**: Tests pass, lint clean, structural validation
2. **LLM critic**: Separate agent evaluates against spec, returns pass/fail with confidence

Below a confidence threshold → route to human reviewer or stronger model. Iteration cap (3-5 attempts) before escalation.

### Artifact-based state, not chat

Phase transitions are driven by files, exit codes, and git commits — never by chat output. The workflow engine checks concrete artifacts:

- Did tests pass? (exit code)
- Does the diff modify the right files? (git diff)
- Does the spec have required sections? (structural validation)

### Sandboxed execution + git coordination

- **Isolation**: One sandbox/worktree per agent task
- **Parallelism**: Independent subtasks run concurrently in separate worktrees
- **Integration**: Merge branches, run integration tests
- **Review**: PRs as the human interface

---

## Proposed Architecture

### `CCCodingRunStepType` — CC as a workflow step

```typescript
const CCCodingRunStepType: IStepType = {
  typeName: 'cc.coding_run',

  metadata: {
    category: 'code_execution',
    displayName: 'Claude Code Coding Run',
    description: 'Execute a coding task via CC Gateway on VPS',
    tags: ['cc-gateway', 'coding', 'vps'],
  },

  configSchema: z.object({
    prompt: z.string().min(1),
    worktree: z.string().default('baseplane-dev1'),
    model: z.string().optional(),
    max_turns: z.number().optional(),
    timeout_ms: z.number().default(3600000),
    budget_usd: z.number().default(5),
    settings_sources: z.array(z.string()).default(['project']),
  }),

  outputSchema: z.object({
    session_id: z.string(),
    result: z.string(),
    turns: z.number(),
    cost_usd: z.number(),
    duration_ms: z.number(),
    commit_hash: z.string().optional(),
    files_changed: z.array(z.string()).optional(),
    test_results: z.object({
      passed: z.boolean(),
      summary: z.string(),
    }).optional(),
  }),

  executionContract: {
    retry_policy: 'exponential_backoff',
    max_retries: 2,
    backoff_config: { initial_delay_ms: 5000, max_delay_ms: 60000, multiplier: 2 },
    idempotent: false,
    default_timeout_ms: 3600000,  // 1 hour
    max_timeout_ms: 7200000,      // 2 hours
    checkpoint_before: true,
    checkpoint_after: true,
    checkpoint_output: true,
    supports_compensation: true,
    compensation_required: false,
    billable_metric: 'api_calls',
  },

  async execute(config, context) {
    // POST /sessions to CC Gateway
    // Stream SSE events, collect result
    // Return typed output
  },

  async compensate(config, context, result) {
    // POST /sessions/:id/abort
    // Optional: git reset on worktree
  },

  validate(config) {
    // Zod parse + check worktree availability
  },
}
```

### Example: Implementation workflow as a DAG

```yaml
workflow_name: implement_spec_phase
description: Implement one phase of a feature spec with quality gates

steps:
  - id: write_code
    type: cc.coding_run
    config:
      prompt: |
        Implement phase {{variables.input.phase}} of spec:
        {{variables.input.spec_content}}

        Requirements:
        - Write production code and tests
        - Commit when done
        - Run tests and report results
      worktree: "{{variables.input.worktree}}"
      budget_usd: 5

  - id: deterministic_check
    type: run_code
    config:
      code: |
        const result = context.stepResults.get('write_code')
        const testsPassed = result.test_results?.passed ?? false
        const hasCommit = !!result.commit_hash
        return {
          passed: testsPassed && hasCommit,
          reason: !testsPassed ? 'Tests failed' : !hasCommit ? 'No commit' : 'OK'
        }

  - id: llm_judge
    type: ai.decide
    config:
      systemPrompt: |
        You are reviewing code changes for a feature implementation.
        Evaluate whether the changes meet the spec requirements.
      inputVariables: [spec_content, write_code_result]
      branches:
        - id: approve
          condition: "Changes fully implement the spec phase"
        - id: iterate
          condition: "Changes need modifications"
        - id: escalate
          condition: "Fundamental approach is wrong or unclear"
      confidenceThreshold:
        autoApprove: 0.9
        escalate: 0.5
      fallbackBranch: escalate

  - id: iterate_code
    type: cc.coding_run
    config:
      prompt: |
        Your previous implementation needs changes:
        {{steps.llm_judge.output.reasoning}}

        Fix the issues and commit.
      worktree: "{{variables.input.worktree}}"
      budget_usd: 3

  - id: human_review
    type: approval
    config:
      approvers: ["{{variables.input.reviewer}}"]
      message: |
        Phase {{variables.input.phase}} needs human review.
        Reason: {{steps.llm_judge.output.reasoning}}
      timeout_hours: 24

edges:
  - from: write_code
    to: deterministic_check
    type: control_flow
  - from: deterministic_check
    to: llm_judge
    type: conditional
    condition: "steps.deterministic_check.output.passed === true"
  - from: deterministic_check
    to: iterate_code
    type: conditional
    condition: "steps.deterministic_check.output.passed === false"
  - from: llm_judge
    to: iterate_code
    type: conditional
    condition: "steps.llm_judge.output.branch === 'iterate'"
  - from: llm_judge
    to: human_review
    type: conditional
    condition: "steps.llm_judge.output.branch === 'escalate'"
  - from: iterate_code
    to: deterministic_check
    type: control_flow

execution_policy:
  max_execution_time_ms: 14400000  # 4 hours
  max_parallel_steps: 1
  on_step_failure: compensate
```

### Multi-phase spec implementation

A parent workflow orchestrates per-phase child workflows:

```yaml
workflow_name: implement_full_spec
steps:
  - id: parse_spec
    type: run_code
    config:
      code: |
        // Parse spec markdown, extract phases
        return { phases: ['p1', 'p2', 'p3'], spec_content: '...' }

  - id: impl_phase_1
    type: workflow.invoke  # Nested workflow
    config:
      workflow_name: implement_spec_phase
      input:
        phase: "{{steps.parse_spec.output.phases[0]}}"
        spec_content: "{{steps.parse_spec.output.spec_content}}"
        worktree: baseplane-dev1

  - id: impl_phase_2
    type: workflow.invoke
    config:
      workflow_name: implement_spec_phase
      input:
        phase: "{{steps.parse_spec.output.phases[1]}}"
        worktree: baseplane-dev2  # Parallel worktree!

  - id: integration_test
    type: cc.coding_run
    config:
      prompt: "Merge phase branches and run full test suite"
      worktree: baseplane-dev1

edges:
  - from: parse_spec
    to: impl_phase_1
    type: control_flow
  - from: parse_spec
    to: impl_phase_2
    type: control_flow  # Parallel with phase 1!
  - from: impl_phase_1
    to: integration_test
    type: control_flow
    join_type: all  # Wait for both phases
  - from: impl_phase_2
    to: integration_test
    type: control_flow
```

---

## What Happens to kata-wm

Three options:

### Option A: kata disappears entirely
Baseplane's workflow engine handles everything. Interactive developer experience is a workflow with `ApprovalStepType` gates. The "mode" is just a workflow template. The "phase" is just the current step.

### Option B: kata becomes a thin interactive CLI
For developers who want to sit in Claude Code and be guided — kata remains as a lightweight mode/template system. But serious orchestration (multi-step, judgment-gated, parallel) runs through baseplane.

### Option C: kata becomes the workflow definition language
kata's templates (modes, phases, tasks) become a DSL that compiles down to baseplane workflow DAG definitions. `kata enter implementation --issue=123` generates a workflow YAML and submits it to baseplane for execution.

---

## Key Insight

The fundamental issue isn't that kata is bad engineering — it's that **it's solving the wrong problem at the wrong layer**. Workflow orchestration belongs in a workflow engine with proper state machines, typed steps, execution contracts, and durable execution. Not in hook callbacks that react to Claude Code events.

Baseplane already has this engine. The CC Gateway already bridges to Claude Code on VPS. The missing piece is one step type (`cc.coding_run`) and workflow templates for common development patterns (implement spec, fix bug, review code).

Everything else — the DAG execution, LLM judgment, human approval, compensation, budget tracking, variable resolution, event triggers — is already built and battle-tested in baseplane's workflow system.
