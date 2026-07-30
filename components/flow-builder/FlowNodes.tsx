'use client'
// One spec-driven node. Its look, handles and routing all come from the node's spec
// (see nodeSpecs.ts): config/action steps get a single in/out; branch steps get labelled
// multi-outputs you wire individually; start/end are terminals.
import { Handle, Position, type NodeProps, type NodeTypes } from '@xyflow/react'
import { colors } from '@/lib/tokens'
import { SPEC_BY_KEY, type ParamValue } from './nodeSpecs'

const HANDLE = { width: 9, height: 9, border: `2px solid ${colors.bg0}` }
const tag = { fontSize: 9.5, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' as const }

// colour a branch output by its meaning
function outColor(label: string) {
  const l = label.toLowerCase()
  if (/(answer|human|match|pass|clear|yes|opt-in)/.test(l)) return colors.green
  if (/(no answer|busy|failed|machine|else|block|suppress|listed|no|opt-out)/.test(l)) return colors.negative
  return colors.info
}

type Data = { specKey: string; params?: Record<string, ParamValue> }

function SpecNode({ data, selected }: NodeProps) {
  const d = data as unknown as Data
  const spec = SPEC_BY_KEY[d.specKey]
  if (!spec) return <div style={{ padding: 8, color: colors.negative }}>?</div>
  const p = d.params || {}
  const accent = spec.accent
  const summary = spec.summary ? spec.summary(p) : ''
  const bd = (on: boolean) => `1px solid ${on ? accent : colors.border2}`

  if (spec.io === 'start' || spec.io === 'end') {
    const start = spec.io === 'start'
    return (
      <div style={{
        background: start ? colors.green : colors.bg3, color: start ? colors.greenInk : colors.fg2,
        border: `1px solid ${start ? colors.green : colors.fg3}`, borderRadius: 20, padding: '7px 22px',
        fontSize: 12, fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase',
        fontFamily: 'var(--font-sans, sans-serif)',
      }}>
        {start
          ? <Handle type="source" position={Position.Bottom} style={{ ...HANDLE, background: colors.green }} />
          : <Handle type="target" position={Position.Top} style={{ ...HANDLE, background: colors.fg3 }} />}
        {spec.label}
      </div>
    )
  }

  if (spec.io === 'branch') {
    const outs = spec.outputs || ['out']
    return (
      <div style={{
        minWidth: 180, background: colors.bg1, borderTop: `3px solid ${accent}`,
        borderRight: bd(selected), borderBottom: bd(selected), borderLeft: bd(selected),
        borderRadius: 8, padding: '9px 13px 20px', boxShadow: '0 2px 8px rgba(0,0,0,0.35)',
        fontFamily: 'var(--font-sans, sans-serif)',
      }}>
        <Handle type="target" position={Position.Top} style={{ ...HANDLE, background: accent }} />
        <div style={{ ...tag, color: accent }}>{spec.group.split(' ')[0]}</div>
        <div style={{ color: colors.fg1, fontSize: 13, fontWeight: 700 }}>{spec.label}</div>
        {summary && <div style={{ color: colors.fg3, fontSize: 11, marginTop: 2 }}>{summary}</div>}
        <div style={{ display: 'flex', justifyContent: 'space-around', gap: 8, marginTop: 8 }}>
          {outs.map(o => <span key={o} style={{ fontSize: 9.5, fontWeight: 700, color: outColor(o) }}>▽ {o}</span>)}
        </div>
        {outs.map((o, i) => (
          <Handle key={o} id={o} type="source" position={Position.Bottom}
            style={{ ...HANDLE, background: outColor(o), left: `${((i + 1) / (outs.length + 1)) * 100}%` }} />
        ))}
      </div>
    )
  }

  // config / action
  const action = spec.io === 'action'
  return (
    <div style={{
      minWidth: 156, background: colors.bg1,
      borderTop: action ? `1px solid ${selected ? accent : colors.border2}` : `1px solid ${selected ? accent : colors.border2}`,
      borderRight: bd(selected), borderBottom: bd(selected),
      borderLeft: `4px solid ${accent}`,
      borderRadius: action ? 18 : 6, padding: '8px 12px', boxShadow: '0 2px 6px rgba(0,0,0,0.3)',
      fontFamily: 'var(--font-sans, sans-serif)',
    }}>
      <Handle type="target" position={Position.Top} style={{ ...HANDLE, background: accent }} />
      <div style={{ ...tag, color: accent, opacity: 0.9 }}>{action ? 'Action' : spec.group.split(' ')[0]}</div>
      <div style={{ color: colors.fg1, fontSize: 12.5, fontWeight: 600 }}>{spec.label}</div>
      {summary && <div style={{ color: colors.fg3, fontSize: 11, marginTop: 2 }}>{summary}</div>}
      <Handle type="source" position={Position.Bottom} style={{ ...HANDLE, background: accent }} />
    </div>
  )
}

export const nodeTypes: NodeTypes = { spec: SpecNode }
