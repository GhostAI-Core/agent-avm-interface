/**
 * SA mobile network prefix allow-list — we may only dial Vodacom, MTN, and Cell C.
 * Source: ICASA allocations supplied by the operator (2026-06-18).
 *
 * WHY THIS EXISTS / IS TEMPORARY: this restriction is purely commercial — those three are the
 * networks that currently let us ride them for Seeker/Grace. It is NOT a permanent compliance
 * rule. When that constraint goes away, set env `NETWORK_PREFIX_GATE=off` (no code change /
 * redeploy of logic needed) and every SA mobile passes the network step.
 *
 * Matched on the national number (digits after +27). Some 0XX blocks belong wholly to an
 * allowed network (matched on 2 digits); the 06x / 063 / 064 / 071 / 081 blocks are SPLIT
 * between operators, so those are matched on 3 digits (= the local 0XXX sub-range, leading 0
 * dropped — e.g. local 0810 → "810").
 *
 * ⚠️ PORTABILITY: a prefix is the ORIGINAL allocation, not the CURRENT carrier. SA Mobile Number
 * Portability means a number may sit on a different network than its prefix implies. This is an
 * allocation filter, not a live-network check; for certainty use an HLR / number-lookup API.
 *
 * NOTE: 066 is SPLIT (confirmed 2026-06-18) — 0660–0665 Vodacom (allowed), 0666–0669 Telkom
 * Mobile (blocked). So it's a 3-digit match (660–665), not a full 2-digit "66" block.
 */

export type MobileProvider = 'Vodacom' | 'MTN' | 'Cell C'

// Per-provider prefixes. `two` = a whole 0XX block (match on 2 digits after +27);
// `three` = a split 0XXX sub-range (match on 3 digits, local leading 0 dropped).
type Block = { two: Set<string>; three: Set<string> }

const VODACOM: Block = {
  two: new Set(['72', '76', '79', '82']),
  three: new Set([
    '606', '607', '608', '609',                 // 060
    '636', '637',                               // 063
    '646', '647', '648', '649',                 // 064
    '660', '661', '662', '663', '664', '665',   // 066 (0666–0669 are Telkom → excluded)
    '711', '712', '713', '714', '715', '716',   // 071
    '818',                                       // 081
  ]),
}
const MTN: Block = {
  two: new Set(['73', '78', '83']),
  three: new Set([
    '603', '604', '605',                         // 060
    '630', '631', '632', '633', '634', '635',    // 063
    '640',                                       // 064
    '710', '717', '718', '719',                  // 071
    '810',                                       // 081
  ]),
}
const CELLC: Block = {
  two: new Set(['62', '74', '84']),
  three: new Set([
    '610', '611', '612', '613', '615', '616', '617', '618', '619', // 061
    '641', '642', '643', '644', '645',           // 064
    '650', '651', '652', '653', '654',           // 065
  ]),
}

const PROVIDERS: ReadonlyArray<readonly [MobileProvider, Block]> = [
  ['Vodacom', VODACOM], ['MTN', MTN], ['Cell C', CELLC],
]

/**
 * The mobile network a +27 number's prefix was ORIGINALLY allocated to (Vodacom / MTN / Cell C),
 * or null for non-+27 / Telkom / Rain / landline prefixes. ⚠️ Original allocation, not the live
 * carrier (see portability note above). Used to label the provider in the UI and to derive the gate.
 */
export function networkProvider(phone: string): MobileProvider | null {
  if (!phone.startsWith('+27')) return null
  const nsn = phone.slice(3) // national number, digits after +27
  const two = nsn.slice(0, 2)
  const three = nsn.slice(0, 3)
  for (const [name, b] of PROVIDERS) if (b.two.has(two) || b.three.has(three)) return name
  return null
}

// Master switch for the (temporary, commercial) prefix gate. Off → the network step is a no-op
// and any SA number passes; the region guard still handles country. Flip via env, no redeploy.
const NETWORK_GATE_ENABLED = process.env.NETWORK_PREFIX_GATE !== 'off'

/**
 * True when an +E.164 SA number is on an allowed network (Vodacom / MTN / Cell C) — i.e. its prefix
 * maps to a provider. When the gate is switched off, returns true for any number.
 */
export function isAllowedNetwork(phone: string): boolean {
  if (!NETWORK_GATE_ENABLED) return true
  return networkProvider(phone) !== null
}
