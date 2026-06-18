/**
 * Outcome classification for the per-number daily rollover (plan.md §5).
 *
 * "Reached" = the callee actually answered (a live human picked up, in any disposition) →
 * we got our one contact for the day, so no more calls to that number today on ANY campaign.
 * Everything else (voicemail / no-answer / busy / failed) is retryable, subject to the daily
 * attempt cap and randomized spacing.
 */
const REACHED = new Set([
  'connected',
  'qualified',
  'no_speech', // line opened, human there, just didn't speak — still reached
  'hangup',
  'ni', // not interested — but they answered
  'dnq', // did not qualify — answered
  'callback', // asked for a callback — answered
])

const RETRYABLE = new Set(['voicemail', 'no_answer', 'busy', 'failed', 'dropped_no_response'])

/** True when the outcome means we reached a live person (ends the day for this number). */
export function isReachedOutcome(outcome: string): boolean {
  return REACHED.has(outcome)
}

/** True when the outcome is a missed attempt eligible for a spaced retry. */
export function isRetryableOutcome(outcome: string): boolean {
  return RETRYABLE.has(outcome)
}
