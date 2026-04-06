---
id: planning
name: "Planning Mode"
description: "Feature planning with research, interviews, spec writing, and review"
mode: planning
mode_skill: planning
phases:
  - id: p0
    name: Research
    task_config:
      title: "P0: Research - understand problem space, find similar patterns"
      labels: [phase, phase-0, research]
    steps:
      - id: clarify-scope
        title: "Clarify scope and context"
        instruction: |
          Use AskUserQuestion to clarify what we're planning:

          AskUserQuestion(questions=[
            {
              question: "What are you planning?",
              header: "Feature",
              options: [
                {label: "New feature", description: "Something that doesn't exist yet"},
                {label: "Enhancement", description: "Expanding existing functionality"},
                {label: "Refactor", description: "Code structure change, no behavior change"},
                {label: "Epic", description: "Large initiative spanning multiple features"}
              ],
              multiSelect: false
            }
          ])

          If `--issue=N` was passed at mode entry, note the issue number.
          If no issue was provided, note "create after spec is ready."

          Document: type, scope, GitHub issue # if known.
          Then: Mark this task completed via TaskUpdate

      - id: codebase-research
        title: "Research existing patterns"
        hints:
          - search: "relevant patterns"
            glob: "src/**/*.ts"
          - search: "related implementations"
            glob: "**/*.ts"
        instruction: |
          SPAWN 2 parallel Explore agents for fast codebase research.

          **Substitute the actual feature topic** from the P0 clarify-scope step
          in place of `{feature_topic}` below before spawning the agents.

          **Agent 1: Code patterns and similar implementations**
          Task(subagent_type="Explore", prompt="
            Find code patterns related to {feature_topic}.
            Search: Glob, Grep, Read relevant files.
            Document: file paths, function names, patterns to follow.
            Be thorough — read files IN FULL, not just search results.
          ", run_in_background=true)

          **Agent 2: Rules, specs, and constraints**
          Task(subagent_type="Explore", prompt="
            Search for existing context on {feature_topic}:
            - .claude/rules/ or .kata/rules/ for applicable constraints
            - planning/specs/ for related or past specs
            - docs/ for relevant documentation
            List: constraints, conventions, prior decisions.
            Read relevant files IN FULL.
          ", run_in_background=true)

          Wait for both agents: TaskOutput(task_id=..., block=true)
          Compile findings into 3-5 bullet points.
          Then: Mark this task completed via TaskUpdate

  - id: p1
    name: Interview
    task_config:
      title: "P1: Interview - gather requirements, architecture, testing, and design from user"
      labels: [phase, phase-1, interview]
      depends_on: [p0]
    steps:
      - id: requirements
        title: "Interview: Requirements"
        skill: interview
        hints:
          - skill: "interview"
            args: "requirements"
        instruction: |
          Run the requirements interview. Document answers in planning notes.
          Focus on: problem statement, happy path, scope boundaries, edge cases.
          Then: Mark this task completed via TaskUpdate

      - id: architecture
        title: "Interview: Architecture"
        skill: interview
        hints:
          - skill: "interview"
            args: "architecture"
        instruction: |
          Run the architecture interview. Document answers in planning notes.
          Focus on: integration points, error handling strategy, performance requirements.
          Then: Mark this task completed via TaskUpdate

      - id: testing
        title: "Interview: Testing Strategy"
        skill: interview
        hints:
          - skill: "interview"
            args: "testing"
        instruction: |
          Run the testing strategy interview. Document answers in planning notes.
          Focus on: happy path scenarios, error paths, test types, verification approach.
          Answers feed the Test Plan and Verification Plan sections in the spec.
          Then: Mark this task completed via TaskUpdate

      - id: design
        title: "Interview: UI Design (skip if backend-only)"
        skill: interview
        hints:
          - skill: "interview"
            args: "design"
        instruction: |
          Skip this step entirely if the feature is backend-only (no UI changes).
          Otherwise, run the design interview. Document answers in planning notes.
          Focus on: reference pages, layout patterns, reusable components.
          Then: Mark this task completed via TaskUpdate

      - id: requirements-approval
        title: "Requirements approval"
        instruction: |
          Compile all interview answers into a structured requirements summary:

          ## Requirements Summary
          **Problem:** [from requirements interview]
          **Happy Path:** [from requirements interview]
          **Scope OUT:** [exclusions]
          **Edge Cases:** [empty state, scale, concurrency decisions]
          **Architecture:** [integration points, error handling, performance]
          **Testing Strategy:** [happy path, error paths, test types]
          **UI Design:** [reference page, layout, components] or "Backend-only"

          Present this summary to the user:

          AskUserQuestion(questions=[{
            question: "Do these requirements look correct? Review the summary above.",
            header: "Approve",
            options: [
              {label: "Approved", description: "Requirements are correct, proceed to spec writing"},
              {label: "Revise", description: "I need to change something — tell me what"}
            ],
            multiSelect: false
          }])

          If "Revise": ask what to change, update the summary, re-present.
          If "Approved": proceed to spec writing.
          Then: Mark this task completed via TaskUpdate

  - id: p2
    name: Spec Writing
    task_config:
      title: "P2: Spec - spawn agent to write feature specification"
      labels: [phase, phase-2, spec]
      depends_on: [p1]
    steps:
      - id: create-spec-file
        title: "Create spec file from template"
        hints:
          - bash: "ls planning/specs/_templates/ 2>/dev/null || ls planning/spec-templates/ 2>/dev/null"
        instruction: |
          Create a new spec file. Copy from the feature spec template:
          ```bash
          # Check if template exists
          ls planning/specs/_templates/ 2>/dev/null || ls planning/spec-templates/ 2>/dev/null
          ```

          Create spec at: `planning/specs/{issue-number}-{slug}.md`

          Use this frontmatter:
          ```yaml
          ---
          initiative: feat-{slug}        # kebab-case, prefix with feat-/fix-/refactor-
          type: project
          issue_type: feature
          status: draft
          priority: medium
          github_issue: {N}              # integer — not a string, not null
          created: {YYYY-MM-DD}
          updated: {YYYY-MM-DD}
          phases:
            - id: p1                     # p1, p2, p3 … (p0 = research, skip in phases)
              name: "Phase Name"
              tasks:
                - "Task description"
                - "Another task"
          ---
          ```

          Frontmatter rules:
          - `github_issue` must be an integer (the issue number), never a string or null
          - `initiative` should be kebab-case with a prefix (e.g., `feat-health-endpoint`)
          - Phase IDs use `p1`, `p2`, `p3` pattern — `p0` is reserved for research, skip it here
          - `phases:` lists implementation phases only (not research or interview)

          Then: Mark this task completed via TaskUpdate

      - id: spawn-spec-writer
        title: "Spawn spec writer agent"
        skill: planning
        instruction: |
          **Do NOT write the spec yourself.** Spawn an agent to preserve context.

          Compile ALL context the agent needs into the prompt:
          - Research findings from P0 (bullet points)
          - All interview answers from P1 (requirements, architecture, testing, design)
          - The approved requirements summary

          Task(subagent_type="general-purpose", prompt="
            ROLE: Spec Writer
            SPEC FILE: planning/specs/{spec-file}.md

            RESEARCH FINDINGS:
            [paste P0 research bullet points]

            APPROVED REQUIREMENTS:
            [paste the full requirements summary from P1 approval gate]

            Write the spec body following this structure:

            ## Overview
            1-3 sentences: what problem this solves, for whom, and why now.

            ## Feature Behaviors
            For each behavior:
              ### B{N}: {Behavior Name}
              **Core:**
              - **ID:** {kebab-case-id}
              - **Trigger:** {what causes this}
              - **Expected:** {what should happen}
              - **Verify:** {how to confirm it works}
              **UI Layer:** {what the user sees}
              **API Layer:** {endpoint, input, output}
              **Data Layer:** {schema changes, if any}

            ## Non-Goals
            Explicit list from Scope OUT answers.

            ## Test Plan
            Based on testing interview answers. For each test:
            - Scenario description
            - Type: unit / integration / e2e
            - What it verifies

            ## Implementation Phases
            Break into 2-5 phases with concrete tasks per phase.
            Phases go in YAML frontmatter phases: array. Example structure:
            ```yaml
            phases:
              - id: p1
                name: "Foundation"
                tasks:
                  - "Set up data model and schema"
                  - "Wire basic API endpoint"
              - id: p2
                name: "UI"
                tasks:
                  - "Build list component"
                  - "Connect to API"
            ```
            Each phase gets test_cases: with 1-3 entries.

            ## Test Infrastructure
            What testing setup exists or needs to be created (e.g., vitest config,
            test runner, mock utilities). The correct build command for this project.

            ## Verification Plan
            Concrete, executable steps to verify the feature works against the REAL
            running system. NOT unit tests — these are commands a fresh agent can run
            to confirm the feature actually works end-to-end.

            For each verification scenario:
              ### VP{N}: {Scenario Name}
              Steps:
              1. {Command to execute — curl, browser URL, CLI invocation}
                 Expected: {specific response, status code, or observable outcome}
              2. {Next command}
                 Expected: {expected result}

            Example format:
              ### VP1: Health endpoint returns 200
              Steps:
              1. `curl -s http://localhost:3000/api/health`
                 Expected: `{"status":"ok"}` with HTTP 200
              2. `curl -s http://localhost:3000/api/health -H "Accept: text/plain"`
                 Expected: `ok` with HTTP 200

            Rules:
            - Every step must be a literal command or URL — no abstract descriptions
            - "Verify that it works" is NOT a valid step
            - Include expected response bodies, status codes, or visible UI state
            - If the feature has no runtime (config-only, template-only), write:
              "No runtime verification — changes are config/template only."

            ## Implementation Hints
            1. Key Imports table — exact package subpath exports and named imports
            2. Code Patterns — 2-5 copy-pasteable snippets (init, wiring, key API usage)
            3. Gotchas — subpath export quirks, peer deps, TS config, code generation
            4. Reference Doc URLs with descriptions

            To fill Implementation Hints: re-read P0 research, web-search for
            integration guides if external libraries are involved, find canonical
            patterns in the project's existing code.

            REQUIREMENTS:
            - No TBD/TODO/placeholder text
            - File paths must reference real files (verify with Glob/Grep)
            - Every behavior must have all Core fields filled
            - ## Verification Plan section MUST have executable steps (not abstract descriptions)
            - Every VP step must have a literal command and expected output
            - Return when spec is complete
          ", run_in_background=false)

          Read the spec file to verify completeness:
          - No placeholder text remaining
          - All sections have content
          - Behaviors have all required fields

          Then: Mark this task completed via TaskUpdate

      - id: link-github-issue
        title: "Create or link GitHub issue"
        instruction: |
          **If issue exists:** Update the `github_issue:` frontmatter field.
          Mark it as spec-in-progress:
          ```bash
          gh issue edit {N} --remove-label "status:todo" --add-label "status:in-progress" --add-label "needs-spec"
          ```

          **If creating new issue:**
          ```bash
          gh issue create \
            --title "{feature title}" \
            --body "$(cat planning/specs/{spec-file}.md | head -50)" \
            --label "feature" \
            --label "status:in-progress" \
            --label "needs-spec"
          ```
          Note the issue number. Update spec frontmatter `github_issue:` field.
          Update spec filename to include issue number: `{N}-{slug}.md`

          **If skipping:** Leave `github_issue: null`

          Then: Mark this task completed via TaskUpdate

  - id: p3
    name: Review Gate
    task_config:
      title: "P3: Review Gate - spec review with fix loop (max 3 passes)"
      labels: [phase, phase-3, review, gate]
      depends_on: [p2]
    steps:
      - id: run-spec-review
        title: "Run spec review (pass 1)"
        agent:
          provider: "${providers.spec_reviewer}"
          prompt: spec-review
          context: [spec]
          output: "reviews/spec-review-{date}.md"
          gate: true
          threshold: 75
        instruction: |
          **SPAWN all reviewers simultaneously in a single message** (do NOT run them sequentially):

          In ONE message, launch all reviewers in parallel:

          - Reviewer 1 — Invoke /code-review:
            Read the code-review skill's reviewer-prompt.md for review instructions, then spawn:
            Task(subagent_type="general-purpose", prompt="
              Review the spec at planning/specs/{spec-file}.md for quality and completeness.
              Check: behaviors have ID/Trigger/Expected/Verify, no placeholder text,
              phases cover all behaviors, each phase has test_cases, non-goals present.
              Return: verdict (PASS / GAPS_FOUND) with specific issues listed by section.
            ", run_in_background=true)

          - Reviewer 2..N — for each provider in kata.yaml reviews.spec_reviewers, spawn a Bash task:
            Task(subagent_type="general-purpose", prompt="
              Run: kata review --prompt=spec-review --context=spec --output=reviews/ --provider=<name>
              Print the full output including score and issues found.
            ", run_in_background=true)

          Read kata.yaml to find configured providers. If none configured, only spawn the code-review reviewer.

          Then wait for ALL task IDs before reading results:
          TaskOutput(task_id=<reviewer-id>, block=true)
          TaskOutput(task_id=<provider-id>, block=true)  # one per provider

          Print each result. Use the external provider score for the gate
          (if no external provider, use code-review verdict: PASS = proceed, GAPS_FOUND = fix loop).

          **Check result:**
          - **PASS (score >= 75):** Skip to close-review step.
          - **GAPS_FOUND (score < 75):** Proceed to fix loop.

          Mark issue as needing review:
          ```bash
          gh issue edit {N} --remove-label "needs-spec" --add-label "needs-review"
          ```

          Then: Mark this task completed via TaskUpdate

      - id: fix-loop
        title: "Fix loop - address review issues (max 3 passes)"
        instruction: |
          **Only execute if spec review score < 75.**

          Read the review output. Issues are categorized by the reviewer.

          **Pass {N} fix cycle:**

          1. Spawn a fixer agent with the specific issues:

             Task(subagent_type="general-purpose", prompt="
               Fix the following spec review issues in planning/specs/{spec-file}.md:
               [paste all issues from the review output]

               For each issue:
               - Read the relevant spec section
               - Fix the gap (add missing content, clarify ambiguity, etc.)
               - Verify no placeholder text (TODO, TBD) remains

               Checklist after fixes:
               - [ ] All behaviors have ID, Trigger, Expected, Verify
               - [ ] No placeholder text
               - [ ] Implementation phases cover all behaviors
               - [ ] Each phase has at least 1 test_case with type
               - [ ] Non-goals section present
               - [ ] Implementation Hints has: dependencies, key imports, 1+ code pattern
               - [ ] Reference doc URLs present (not just library names)
               - [ ] Verification Strategy specifies build command and test infra
             ", run_in_background=false)

          2. Re-run spec review:
             ```bash
             kata review --prompt=spec-review --context=spec --output=reviews/
             ```

          3. Check new score:
             - **score >= 75:** Exit fix loop, proceed to close-review.
             - **score < 75 and pass < 3:** Repeat fix cycle with new issues.
             - **score < 75 and pass = 3 (max reached):** Escalate to user.

          **After 3 failed passes — escalate:**

          Present remaining issues and score to the user:

          AskUserQuestion(questions=[{
            question: "Spec review scored {score}/100 after 3 fix passes. Remaining issues above. How to proceed?",
            header: "Gate",
            options: [
              {label: "Accept as-is", description: "Proceed with current spec quality"},
              {label: "Fix manually", description: "I'll address the remaining issues myself"},
              {label: "Retry", description: "Run another fix pass with different approach"}
            ],
            multiSelect: false
          }])

          If "Accept as-is": proceed to close-review.
          If "Fix manually": wait for user edits, then re-run review.
          If "Retry": run one more fix+review cycle.

          Then: Mark this task completed via TaskUpdate

      - id: close-review
        title: "Close review gate"
        instruction: |
          Review gate passed (or user accepted).

          Update issue labels:
          ```bash
          gh issue edit {N} --remove-label "needs-review" --add-label "reviewed"
          ```

          Log the gate result for the finalize phase:
          - Final score: {score}/100
          - Passes used: {N}/3
          - Status: PASSED | ACCEPTED_BY_USER

          Then: Mark this task completed via TaskUpdate

  - id: p4
    name: Finalize
    task_config:
      title: "P4: Finalize - approve spec, commit, push"
      labels: [phase, phase-4, finalize]
      depends_on: [p3]
    steps:
      - id: validate-spec
        title: "Validate spec before approval"
        gate:
          bash: "kata validate-spec planning/specs/{spec-file}.md"
          expect_exit: 0
          on_fail: "Spec validation failed. Fix frontmatter issues before approval."
        hints:
          - bash: "kata validate-spec planning/specs/{spec-file}.md"
          - read: "{spec_path}"
        instruction: |
          Run the spec validator. This is REQUIRED — do not skip.

          ```bash
          kata validate-spec planning/specs/{spec-file}.md
          ```

          The validator checks:
          - YAML frontmatter exists and parses correctly
          - `github_issue` is an integer
          - `phases:` array has entries with `id`, `name`, `tasks`
          - At least one task is defined across all phases

          **If validation fails (exit code != 0):** Fix the reported errors and re-run
          until it passes. Do NOT proceed to approval with a failing spec.

          **Additional content checks (manual):**
          - [ ] No placeholder text (TODO, TBD, `{placeholder}`, `[placeholder]`)
          - [ ] Every behavior has: ID, Trigger, Expected, Verify
          - [ ] Verification Plan has literal commands (not abstract descriptions)

          Then: Mark this task completed via TaskUpdate

      - id: approve-spec
        title: "Mark spec approved and commit"
        instruction: |
          Update spec frontmatter: `status: approved`
          Update `updated:` field to today's date.

          Commit:
          ```bash
          git add planning/specs/{spec-file}.md
          git commit -m "docs(spec): {feature title} — spec approved"
          git push
          ```

          Mark issue as approved and ready for implementation:
          ```bash
          gh issue edit {N} --remove-label "needs-review" --remove-label "status:in-progress" --add-label "approved" --add-label "status:todo"
          ```

      - id: update-issue
        title: "Update GitHub issue with spec link"
        instruction: |
          If GitHub issue exists:
          ```bash
          gh issue comment {N} --body "Spec approved: planning/specs/{spec-file}.md

          Ready for implementation: \`kata enter implementation\`"
          ```

          Then: Mark this task completed via TaskUpdate

global_conditions:
  - changes_committed
  - changes_pushed
---
