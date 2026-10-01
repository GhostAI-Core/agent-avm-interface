import { SPECS } from './nodeSpecs'

export type RawGeneratedNode = { id?: string; specKey?: string; params?: Record<string, unknown> }
export type RawGeneratedEdge = { id?: string; source?: string; target?: string; sourceHandle?: string }

/**
 * Drop invented node types and dangling edges from Claude's tool payload so the
 * canvas never receives a specKey the inspector cannot render.
 */
export function sanitizeGeneratedFlow(input: {
  nodes?: RawGeneratedNode[]
  edges?: RawGeneratedEdge[]
}): { nodes: RawGeneratedNode[]; edges: RawGeneratedEdge[] } {
  const valid = new Set(SPECS.map(s => s.key))
  const nodes = (input.nodes ?? []).filter(n => !!n?.id && !!n.specKey && valid.has(n.specKey))
  const ids = new Set(nodes.map(n => n.id as string))
  const edges = (input.edges ?? []).filter(
    e => !!e?.source && !!e.target && ids.has(e.source) && ids.has(e.target),
  )
  return { nodes, edges }
}
