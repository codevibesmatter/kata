---
id: stop-hook-test
name: Stop Hook Test
description: Eval-only mode that exercises each stop condition in sequence
mode: stop-hook-test
workflow_prefix: "SH"

phases:
  - id: p0
    name: Write
    task_config:
      title: "P0: Write a trivial file"
      labels: [phase, phase-0]
    steps:
      - id: write-file
        title: "Create a single-file utility"
        hints:
          - bash: "echo 'creating probe file'"
        instruction: |
          Create ONE small file: `src/utils/stop-hook-probe.ts`

          Contents — copy this exactly:
          ```typescript
          /** Probe file created by stop-hook-test mode. */
          export function probe(): string {
            return "stop-hook-probe"
          }
          ```

          Do NOT commit yet. Do NOT push yet.
          After writing the file, mark this task completed and STOP.
          Output: "Step complete. Waiting for next instruction."

          IMPORTANT: After marking this task completed, do not continue
          to the next task. End your response here.

  - id: p1
    name: Commit
    task_config:
      title: "P1: Commit the file"
      labels: [phase, phase-1]
      depends_on: [p0]
    steps:
      - id: commit-file
        title: "Stage and commit"
        instruction: |
          Stage and commit the probe file:
          ```bash
          git add src/utils/stop-hook-probe.ts
          git commit -m "test: stop-hook-probe"
          ```

          Do NOT push yet.
          After committing, mark this task completed and STOP.
          Output: "Step complete. Waiting for next instruction."

          IMPORTANT: After marking this task completed, do not continue
          to the next task. End your response here.

  - id: p2
    name: Push
    task_config:
      title: "P2: Push to remote"
      labels: [phase, phase-2]
      depends_on: [p1]
    steps:
      - id: push-changes
        title: "Push the commit"
        instruction: |
          Push the commit to the remote:
          ```bash
          git push
          ```

          After pushing, mark this task completed and STOP.
          Output: "Step complete. Waiting for next instruction."

          IMPORTANT: After marking this task completed, do not continue
          to the next task. End your response here.

  - id: p3
    name: Cleanup
    task_config:
      title: "P3: Revert and clean up"
      labels: [phase, phase-3]
      depends_on: [p2]
    steps:
      - id: revert
        title: "Revert the probe commit"
        instruction: |
          Revert the probe commit so it doesn't pollute the project:
          ```bash
          git revert --no-edit HEAD
          git push
          ```

          After reverting and pushing, mark this task completed.
          All tasks are now done. You may stop.

global_conditions:
  - changes_committed
  - changes_pushed
---

# Stop Hook Test Mode

**Eval-only mode** — exercises each stop condition in isolation.

## Purpose

This mode creates a sequence of trivial tasks designed to trigger
the stop hook at each stage:

1. **After writing** — stop hook blocks: uncommitted changes + tasks pending
2. **After committing** — stop hook blocks: unpushed commits + tasks pending
3. **After pushing** — stop hook blocks: tasks still pending
4. **After completing all tasks** — stop hook allows exit

## How It Works

Each phase has a single trivial step with an explicit "STOP after this step"
instruction. When the agent tries to end its response, the stop hook fires
and blocks because remaining conditions aren't met.

The final phase reverts the probe file so the project stays clean.

## Stop Conditions

- `tasks_complete` — all native tasks must be completed
- `committed` — no uncommitted tracked changes
- `pushed` — all commits pushed to remote

## Usage

This mode is designed for the eval harness, not interactive use:
```bash
npm run eval -- --scenario=stop-hook-test --project=/path/to/project
```
