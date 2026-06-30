import { NextResponse } from 'next/server'

// Server-side CallOps client. The single channel for all operational reads/writes:
// the dashboard never touches CallOps operational tables in Supabase directly.
// Each call forwards the user's Supabase bearer token; CallOps enforces company scoping.
const CALLOPS_URL = (process.env.CALLOPS_URL ?? '').replace(/\/$/, '')

export class CallopsError extends Error {
  constructor(public status: number, public body: string) {
    super(`CallOps ${status}: ${body}`)
    this.name = 'CallopsError'
  }
}

async function call<T>(method: string, path: string, token: string, body?: unknown): Promise<T> {
  if (!CALLOPS_URL) throw new CallopsError(500, 'CALLOPS_URL not configured')
  const res = await fetch(`${CALLOPS_URL}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
    cache: 'no-store',
  })
  const text = await res.text()
  if (!res.ok) throw new CallopsError(res.status, text)
  return (text ? JSON.parse(text) : undefined) as T
}

export const callopsGet = <T>(path: string, token: string) => call<T>('GET', path, token)

// List endpoints return the paginated `{items: [...]}` envelope. Tolerate the older
// `{companies}`/`{campaigns}` shapes and a bare array too, so a key mismatch can never
// silently empty the dashboard again.
export async function callopsItems<T = unknown>(path: string, token: string): Promise<T[]> {
  const d = await callopsGet<{ items?: T[]; companies?: T[]; campaigns?: T[] } | T[]>(path, token)
  if (Array.isArray(d)) return d
  return d.items ?? d.companies ?? d.campaigns ?? []
}
export const callopsPost = <T>(path: string, token: string, body?: unknown) =>
  call<T>('POST', path, token, body)
export const callopsPatch = <T>(path: string, token: string, body?: unknown) =>
  call<T>('PATCH', path, token, body)

// Map a thrown CallopsError back to an equivalent HTTP response for the browser,
// passing CallOps' own error envelope through when it's JSON.
export function callopsErrorResponse(e: unknown): NextResponse {
  if (e instanceof CallopsError) {
    // Normalise CallOps' {error:{code,message}} (or {message}/{detail}) to a string `error`
    // so existing frontend error handling (which expects json.error to be a string) works.
    let msg: string = e.body
    try {
      const j = JSON.parse(e.body)
      const m = j?.error?.message ?? j?.error ?? j?.message ?? j?.detail ?? e.body
      msg = typeof m === 'string' ? m : JSON.stringify(m)
    } catch { /* non-JSON body: keep raw text */ }
    return NextResponse.json({ error: msg }, { status: e.status })
  }
  console.error('CallOps proxy error:', e)
  return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
}
