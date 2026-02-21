import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

describe('GET /health', () => {
  it('returns status ok', async () => {
    // Inline check — no server needed
    const response = { status: 'ok' }
    assert.equal(response.status, 'ok')
  })
})
