---
initiative: health-endpoint
type: project
issue_type: feature
status: approved
priority: medium
github_issue: 100
created: 2026-02-25
updated: 2026-02-25
phases:
  - id: p1
    name: "Health endpoint"
    tasks:
      - "Add GET /api/health server function returning { status: ok, timestamp: ISO string }"
  - id: p2
    name: "Uptime tracking"
    tasks:
      - "Add server start time tracking and uptime_seconds field to health response"
---

# Health Endpoint

> GitHub Issue: #100

## Overview

Add a simple health check endpoint for monitoring. Returns server status and uptime information. This is a minimal feature used to exercise the task generation and implementation workflow.

## Feature Behaviors

### B1: Health Status Response

**Core:**
- **ID:** health-status
- **Trigger:** GET request to /api/health
- **Expected:** Returns JSON `{ status: "ok", timestamp: "<ISO 8601>" }`
- **Verify:** `curl /api/health` returns 200 with valid JSON

#### API Layer
- Route: `src/routes/api/health.ts`
- Method: GET
- Response: `{ status: "ok", timestamp: string }`

### B2: Uptime Tracking

**Core:**
- **ID:** uptime-tracking
- **Trigger:** GET request to /api/health (after B1 is implemented)
- **Expected:** Response includes `uptime_seconds` field (integer, seconds since server start)
- **Verify:** Two requests seconds apart show increasing uptime values

#### API Layer
- Track `startTime` at module level
- Compute `uptime_seconds = Math.floor((Date.now() - startTime) / 1000)`

## Non-Goals

- No authentication on health endpoint
- No database connectivity checks
- No dependency health checks

## Verification Plan

### VP1: Health endpoint returns valid JSON

**Steps:**
1. Start dev server: `npm run dev`
2. Wait for server ready (check http://localhost:3000)
3. `curl -s http://localhost:3000/api/health`
4. Confirm response has `status: "ok"` and valid ISO 8601 `timestamp`

**Expected:** 200 OK with `{ "status": "ok", "timestamp": "..." }`

### VP2: Uptime tracking works

**Steps:**
1. (Dev server already running from VP1)
2. `curl -s http://localhost:3000/api/health` — note `uptime_seconds`
3. `sleep 2`
4. `curl -s http://localhost:3000/api/health` — note `uptime_seconds` again
5. Confirm second value > first value

**Expected:** `uptime_seconds` increases between requests

## Implementation Phases

See YAML frontmatter `phases:` above.
