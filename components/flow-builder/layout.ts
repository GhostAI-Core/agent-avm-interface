import { MarkerType, type Edge, type Node } from '@xyflow/react'
import { SPEC_BY_KEY, defaultParams, type ParamValue } from './nodeSpecs'
import { colors } from '@/lib/tokens'

export const colorFor = (handle?: string | null) => {
  const l = (handle || '').toLowerCase()
  if (/(answer|human|match|pass|clear|opt-in)/.test(l) && !/no answer/.test(l)) return colors.green
  if (/(no answer|busy|failed|machine|else|block|suppress|listed|opt-out)/.test(l)) return colors.negative
  return colors.fg3
}

export const mkNode = (id: string, specKey: string, x: number, y: number, params?: Record<string, ParamValue>): Node => {
  const spec = SPEC_BY_KEY[specKey]
  return { id, type: 'spec', position: { x, y }, data: { specKey, params: { ...defaultParams(spec), ...params } } }
}

export const mkEdge = (id: string, source: string, target: string, handle?: string, label?: string): Edge => {
  const stroke = handle ? colorFor(handle) : colors.fg3
  return {
    id, source, target, sourceHandle: handle, label,
    markerEnd: { type: MarkerType.ArrowClosed, color: stroke },
    style: { stroke, strokeWidth: handle ? 2 : 1.5 },
    labelStyle: { fill: colors.fg3, fontSize: 10 }, labelBgStyle: { fill: colors.bg0 },
  }
}

export type RawNode = { id: string; specKey: string; params?: Record<string, ParamValue> }
export type RawEdge = { id?: string; source: string; target: string; sourceHandle?: string }

/** Layered top-down layout: depth = longest path from a root, siblings spread horizontally. */
export function layoutFlow(rawNodes: RawNode[], rawEdges: RawEdge[]): { nodes: Node[]; edges: Edge[] } {
  const ids = rawNodes.map(n => n.id)
  const idset = new Set(ids)
  const adj = new Map<string, string[]>(); ids.forEach(i => adj.set(i, []))
  const indeg = new Map<string, number>(); ids.forEach(i => indeg.set(i, 0))
  for (const e of rawEdges) {
    if (idset.has(e.source) && idset.has(e.target)) { adj.get(e.source)!.push(e.target); indeg.set(e.target, (indeg.get(e.target) || 0) + 1) }
  }
  const depth = new Map<string, number>()
  const work = ids.filter(i => (indeg.get(i) || 0) === 0); work.forEach(i => depth.set(i, 0))
  const q = [...work]
  while (q.length) {
    const u = q.shift()!
    for (const v of adj.get(u) || []) {
      depth.set(v, Math.max(depth.get(v) ?? 0, (depth.get(u) ?? 0) + 1))
      indeg.set(v, (indeg.get(v) || 1) - 1)
      if ((indeg.get(v) || 0) === 0) q.push(v)
    }
  }
  const byDepth = new Map<number, string[]>()
  ids.forEach(i => { const d = depth.get(i) ?? 0; if (!byDepth.has(d)) byDepth.set(d, []); byDepth.get(d)!.push(i) })
  const pos = new Map<string, { x: number; y: number }>()
  for (const [d, arr] of byDepth) arr.forEach((id, idx) => pos.set(id, { x: 440 + (idx - (arr.length - 1) / 2) * 240, y: 40 + d * 120 }))
  const nodes: Node[] = rawNodes.map(n => {
    const spec = SPEC_BY_KEY[n.specKey]
    return { id: n.id, type: 'spec', position: pos.get(n.id) || { x: 440, y: 40 }, data: { specKey: n.specKey, params: { ...(spec ? defaultParams(spec) : {}), ...(n.params || {}) } } }
  })
  const edges: Edge[] = rawEdges
    .filter(e => idset.has(e.source) && idset.has(e.target))
    .map((e, i) => mkEdge(e.id || `ae${i}`, e.source, e.target, e.sourceHandle, e.sourceHandle))
  return { nodes, edges }
}
