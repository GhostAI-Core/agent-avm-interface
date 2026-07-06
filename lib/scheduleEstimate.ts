// Assumed press-1/9 DTMF response delay per call (decided 2026-06-18).
export const DTMF_RESPONSE_SECONDS = 8

export function formatDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.round(totalSeconds))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  if (h > 0) return `${h}h ${m}m`
  if (m > 0) return `${m}m ${sec}s`
  return `${sec}s`
}

/** Read an audio file/URL's duration (seconds) client-side, or null if it can't be read. */
export function measureAudioDuration(src: string): Promise<number | null> {
  return new Promise(resolve => {
    const a = new Audio()
    a.preload = 'metadata'
    a.onloadedmetadata = () => resolve(Number.isFinite(a.duration) ? a.duration : null)
    a.onerror = () => resolve(null)
    a.src = src
  })
}

/**
 * Run-time estimate: whichever constraint binds first — the dialing_speed rate limiter
 * (calls/minute, matching CallOps' RateLimiter) or the max_concurrent ceiling.
 */
export function estimateRunSeconds(opts: {
  contactCount: number
  scriptSeconds: number | null
  dialingSpeed: number
  maxConcurrent: number
}): { estimateSeconds: number; rateLimitedSeconds: number; concurrencyLimitedSeconds: number; perCallSeconds: number } {
  const { contactCount, scriptSeconds, dialingSpeed, maxConcurrent } = opts
  const perCallSeconds = (scriptSeconds ?? 0) + DTMF_RESPONSE_SECONDS
  const rateLimitedSeconds = contactCount * 60 / Math.max(1, dialingSpeed)
  const concurrencyLimitedSeconds = contactCount * perCallSeconds / Math.max(1, maxConcurrent)
  return { estimateSeconds: Math.max(rateLimitedSeconds, concurrencyLimitedSeconds), rateLimitedSeconds, concurrencyLimitedSeconds, perCallSeconds }
}
