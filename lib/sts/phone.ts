/**
 * Pure MSISDN normalization for STS — kept free of the `server-only` guard so it is unit-testable
 * and reusable on either side. STS uses `27820010201`; our DB stores `+27820010201`.
 */
export function toE164(raw: string): string {
  const trimmed = String(raw).trim()
  if (trimmed.startsWith('+')) return '+' + trimmed.slice(1).replace(/\D/g, '')
  const digits = trimmed.replace(/\D/g, '')
  if (digits.startsWith('00')) return '+' + digits.slice(2)
  return '+' + digits
}
