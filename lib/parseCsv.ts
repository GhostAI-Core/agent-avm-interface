/**
 * Robust contact-CSV parser shared by the campaign create + reuse flows.
 *
 * Handles the real-world cases the old `line.split(',')` broke on:
 *  - UTF-8 BOM (Excel "CSV UTF-8" export)
 *  - Quoted fields with embedded commas/newlines ("Smith, Jr")
 *  - Escaped quotes ("")
 *  - Alternate delimiters (`;` `\t` `|` — common in ZA/EU Excel locales)
 *  - CRLF / lone CR line endings
 *  - Empty / header-only / whitespace-only files (returns [] instead of throwing)
 *  - Short rows (missing trailing columns)
 *
 * Only `phone`, `first_name`, `last_name` columns are extracted; rows without a
 * phone value are dropped. A `phone` header is required — without it, returns [].
 */

export interface ParsedContact {
  phone: string
  first_name?: string
  last_name?: string
}

const OPTIONAL_FIELDS = ['first_name', 'last_name'] as const

function detectDelimiter(headerLine: string): string {
  const candidates = [',', ';', '\t', '|']
  let best = ','
  let bestCount = -1
  for (const d of candidates) {
    const count = headerLine.split(d).length - 1
    if (count > bestCount) {
      bestCount = count
      best = d
    }
  }
  return best
}

/** RFC 4180-style tokenizer: quote-aware, handles embedded delimiters/newlines. */
function tokenize(text: string, delim: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let inQuotes = false

  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i++ } // escaped quote
        else inQuotes = false
      } else {
        field += ch
      }
      continue
    }
    if (ch === '"') {
      inQuotes = true
    } else if (ch === delim) {
      row.push(field); field = ''
    } else if (ch === '\n') {
      row.push(field); rows.push(row); row = []; field = ''
    } else if (ch === '\r') {
      if (text[i + 1] !== '\n') { row.push(field); rows.push(row); row = []; field = '' }
    } else {
      field += ch
    }
  }
  row.push(field)
  rows.push(row)
  return rows
}

export function parseContacts(raw: string): ParsedContact[] {
  const text = raw.replace(/^﻿/, '') // strip BOM
  if (!text.trim()) return []

  const firstBreak = text.search(/\r?\n/)
  const headerLine = firstBreak === -1 ? text : text.slice(0, firstBreak)
  const delim = detectDelimiter(headerLine)

  const rows = tokenize(text, delim).filter(r => r.some(c => c.trim() !== ''))
  if (rows.length < 2) return [] // header-only or empty

  const headers = rows[0].map(h => h.trim().toLowerCase())
  const phoneIdx = headers.indexOf('phone')
  if (phoneIdx === -1) return [] // no usable phone column

  const optionalIdx: Partial<Record<(typeof OPTIONAL_FIELDS)[number], number>> = {}
  for (const f of OPTIONAL_FIELDS) {
    const i = headers.indexOf(f)
    if (i !== -1) optionalIdx[f] = i
  }

  return rows
    .slice(1)
    .map(cells => {
      const contact: ParsedContact = { phone: (cells[phoneIdx] ?? '').trim() }
      for (const f of OPTIONAL_FIELDS) {
        const i = optionalIdx[f]
        if (i !== undefined) contact[f] = (cells[i] ?? '').trim()
      }
      return contact
    })
    .filter(c => c.phone)
}
