/**
 * Normalize a phone string for LiveKit SIP dial and DB storage.
 *
 * Handles malformed imports such as `"\"+27 86 656 7784\""` → `+27866567784`.
 */
export function normalizePhone(input: string): string {
  if (!input) return ''

  let s = input.trim()
  // Strip one or more layers of surrounding quotes
  while (
    (s.startsWith('"') && s.endsWith('"')) ||
    (s.startsWith("'") && s.endsWith("'"))
  ) {
    s = s.slice(1, -1).trim()
  }

  const hasPlus = s.includes('+')
  const digits = s.replace(/\D/g, '')
  if (!digits) return ''

  // South Africa: leading 0 → +27
  if (!hasPlus && digits.startsWith('0') && digits.length >= 9) {
    return `+27${digits.slice(1)}`
  }

  return `+${digits}`
}
