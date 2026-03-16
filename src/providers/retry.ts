/**
 * Retry with exponential backoff for rate-limited provider calls.
 *
 * Used by CLI-based providers (gemini, codex) that hit API rate limits.
 * SDK-based providers (claude) handle retries internally.
 */

const RATE_LIMIT_PATTERN = /rate.?limit|429|quota|too many requests|resource.?exhausted/i

/** Check if an error message indicates a rate limit. */
export function isRateLimitError(message: string): boolean {
  return RATE_LIMIT_PATTERN.test(message)
}

/**
 * Retry an async function with exponential backoff on rate limit errors.
 * Non-rate-limit errors are thrown immediately.
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  opts: { maxRetries?: number; label?: string } = {},
): Promise<T> {
  const maxRetries = opts.maxRetries ?? 3
  const label = opts.label ?? 'provider'

  let lastError: Error | undefined

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn()
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      if (!isRateLimitError(message) || attempt >= maxRetries - 1) {
        throw err
      }
      lastError = err instanceof Error ? err : new Error(message)
      const delayMs = 2000 * 2 ** attempt // 2s, 4s, 8s
      process.stderr.write(
        `${label}: rate limited, retrying in ${delayMs / 1000}s (attempt ${attempt + 2}/${maxRetries})...\n`,
      )
      await sleep(delayMs)
    }
  }

  throw lastError // unreachable, but satisfies TS
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
