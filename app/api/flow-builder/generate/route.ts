import { NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { SPECS } from '@/components/flow-builder/nodeSpecs'

export const runtime = 'nodejs'

// Describe every available node (from the same spec registry the UI uses) so Claude can only
// build flows out of real, configurable node types with valid fields.
function catalog(): string {
  return SPECS.map(s => {
    const f = s.fields.map(x => {
      if (x.type === 'select') return `${x.key}:select(${x.options.join('|')})`
      if (x.type === 'number') return `${x.key}:number${x.unit ? `[${x.unit}]` : ''}`
      if (x.type === 'toggle') return `${x.key}:bool`
      return `${x.key}:text`
    }).join(', ')
    const outs = s.io === 'branch' ? ` OUTPUTS[${(s.outputs || []).join(', ')}]` : ''
    return `- ${s.key} (${s.group}, ${s.io})${f ? ` fields: ${f}` : ''}${outs}`
  }).join('\n')
}

const SYSTEM = `You are a flow architect for EVRA's outbound call-campaign builder. Turn the user's request into a pipeline of connected nodes using ONLY the node types listed below.

Rules:
- Use only these node types (by their exact key) and only their listed fields. Never invent node types or fields.
- The flow MUST start with exactly one "start" node and finish at one or more "end" nodes.
- Connect nodes with edges (source -> target). For a branch node, set the edge's sourceHandle to the EXACT output label from its OUTPUTS list (e.g. "Answered", "match", "else", "pass").
- Put field values in each node's params, using the field keys. For select fields choose one of the listed options; for numbers use a sensible value; for text write a short realistic value.
- Model a coherent call pipeline: dial/answer, engage/playback, DTMF or speech input, then outcome/compliance actions. Include branches and compliance checks when the request implies them.
- Keep node ids short and unique (n1, n2, ...). Every edge's source and target must be an id you defined.

NODE TYPES:
${catalog()}`

type RawNode = { id?: string; specKey?: string; params?: Record<string, unknown> }
type RawEdge = { id?: string; source?: string; target?: string; sourceHandle?: string }

const BUILD_FLOW_TOOL: Anthropic.Tool = {
  name: 'build_flow',
  description: 'Return the campaign flow as nodes and edges.',
  input_schema: {
    type: 'object',
    properties: {
      nodes: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            specKey: { type: 'string', enum: SPECS.map(s => s.key) },
            params: { type: 'object', description: 'field values keyed by field name' },
          },
          required: ['id', 'specKey'],
        },
      },
      edges: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            source: { type: 'string' },
            target: { type: 'string' },
            sourceHandle: { type: 'string', description: 'branch output label, if the source is a branch' },
          },
          required: ['source', 'target'],
        },
      },
    },
    required: ['nodes', 'edges'],
  },
}

export async function POST(req: Request) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: 'ANTHROPIC_API_KEY is not set. Add it to .env to enable AI flow generation.' }, { status: 400 })
  }
  let prompt = ''
  try { prompt = (await req.json())?.prompt ?? '' } catch { /* ignore */ }
  if (!prompt.trim()) return NextResponse.json({ error: 'Describe the flow you want.' }, { status: 400 })

  const client = new Anthropic()
  try {
    const msg = await client.messages.create({
      model: 'claude-opus-4-8',
      max_tokens: 4096,
      system: SYSTEM,
      tools: [BUILD_FLOW_TOOL],
      tool_choice: { type: 'tool', name: 'build_flow' },
      messages: [{ role: 'user', content: prompt }],
    })
    const tu = msg.content.find(b => b.type === 'tool_use')
    if (!tu || tu.type !== 'tool_use') return NextResponse.json({ error: 'Claude did not return a flow.' }, { status: 502 })

    const input = tu.input as { nodes?: RawNode[]; edges?: RawEdge[] }
    const valid = new Set(SPECS.map(s => s.key))
    const nodes = (input.nodes ?? []).filter(n => !!n?.id && !!n.specKey && valid.has(n.specKey))
    const ids = new Set(nodes.map(n => n.id))
    const edges = (input.edges ?? []).filter(e => !!e?.source && !!e.target && ids.has(e.source) && ids.has(e.target))
    if (!nodes.length) return NextResponse.json({ error: 'Claude returned an empty flow — try rephrasing.' }, { status: 502 })
    return NextResponse.json({ nodes, edges })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Generation failed.'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
