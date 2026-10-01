'use client'
// Campaign flow-builder POC — spec-driven nodes with a live config inspector.
// Every node exposes typed inputs (nodeSpecs.ts) that change its behaviour; branches route via
// labelled outputs you wire individually. Visual demo only: no persistence.
import { useCallback, useMemo, useRef, useState } from 'react'
import {
  ReactFlow, ReactFlowProvider, Background, BackgroundVariant, Controls, MiniMap, Panel,
  addEdge, useNodesState, useEdgesState, useReactFlow, MarkerType,
  type Node, type Edge, type Connection,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import Box from '@mui/material/Box'
import Stack from '@mui/material/Stack'
import Button from '@mui/material/Button'
import Typography from '@mui/material/Typography'
import Dialog from '@mui/material/Dialog'
import TextField from '@mui/material/TextField'
import MenuItem from '@mui/material/MenuItem'
import Switch from '@mui/material/Switch'
import FormControlLabel from '@mui/material/FormControlLabel'
import { nodeTypes } from './FlowNodes'
import { SPEC_BY_KEY, GROUPS, type ParamValue } from './nodeSpecs'
import { colorFor, mkNode, mkEdge, layoutFlow } from './layout'
import { colors } from '@/lib/tokens'

const initialNodes: Node[] = [
  mkNode('start', 'start', 360, 0),
  mkNode('call', 'call-result', 300, 80),
  mkNode('tts', 'play-tts', 300, 230, { message: 'Hi, this is EVRA on behalf of…' }),
  mkNode('collect', 'collect-dtmf', 306, 330),
  mkNode('key', 'dtmf-key', 300, 430, { key: '1' }),
  mkNode('lead', 'mark-lead', 140, 550),
  mkNode('wa', 'whatsapp', 140, 650),
  mkNode('hang', 'hang-up', 520, 560, { reason: 'Declined' }),
  mkNode('end', 'end', 360, 760),
]
const initialEdges: Edge[] = [
  mkEdge('e-s', 'start', 'call'),
  mkEdge('e-ans', 'call', 'tts', 'Answered', 'answered'),
  mkEdge('e-na', 'call', 'hang', 'No Answer', 'no answer'),
  mkEdge('e-busy', 'call', 'hang', 'Busy'),
  mkEdge('e-fail', 'call', 'hang', 'Failed'),
  mkEdge('e-tc', 'tts', 'collect'),
  mkEdge('e-ck', 'collect', 'key'),
  mkEdge('e-match', 'key', 'lead', 'match', 'press 1'),
  mkEdge('e-lw', 'lead', 'wa'),
  mkEdge('e-we', 'wa', 'end'),
  mkEdge('e-else', 'key', 'hang', 'else', 'no key'),
  mkEdge('e-he', 'hang', 'end'),
]

function Builder({ embedded }: { embedded: boolean }) {
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges)
  const [io, setIo] = useState<{ open: boolean; mode: 'export' | 'import'; text: string }>({ open: false, mode: 'export', text: '' })
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({ Dial: true })
  const [selId, setSelId] = useState<string | null>('key')
  // AI (Claude) flow generation + proof-check preview
  const [aiText, setAiText] = useState('')
  const [aiBusy, setAiBusy] = useState(false)
  const [aiErr, setAiErr] = useState<string | null>(null)
  const [preview, setPreview] = useState<{ nodes: Node[]; edges: Edge[] } | null>(null)
  const idRef = useRef(100)
  const { screenToFlowPosition } = useReactFlow()

  const selected = useMemo(() => nodes.find(n => n.id === selId) || null, [nodes, selId])
  const selSpec = selected ? SPEC_BY_KEY[(selected.data as { specKey: string }).specKey] : null

  const onConnect = useCallback((c: Connection) => {
    const stroke = colorFor(c.sourceHandle)
    setEdges(eds => addEdge({ ...c, style: { stroke, strokeWidth: 2 }, markerEnd: { type: MarkerType.ArrowClosed, color: stroke } }, eds))
  }, [setEdges])

  const spawn = useCallback((specKey: string, pos: { x: number; y: number }) => {
    const id = `n${idRef.current++}`
    setNodes(ns => ns.concat(mkNode(id, specKey, pos.x, pos.y)))
    setSelId(id)
  }, [setNodes])

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    const key = e.dataTransfer.getData('application/flow')
    if (key) spawn(key, screenToFlowPosition({ x: e.clientX, y: e.clientY }))
  }, [spawn, screenToFlowPosition])

  const setParam = useCallback((key: string, value: ParamValue) => {
    setNodes(ns => ns.map(n => {
      if (n.id !== selId) return n
      const data = n.data as { specKey: string; params?: Record<string, ParamValue> }
      return { ...n, data: { ...data, params: { ...(data.params || {}), [key]: value } } }
    }))
  }, [selId, setNodes])

  const deleteSelected = () => { if (selId) { setNodes(ns => ns.filter(n => n.id !== selId)); setEdges(es => es.filter(e => e.source !== selId && e.target !== selId)); setSelId(null) } }
  const doExport = () => setIo({ open: true, mode: 'export', text: JSON.stringify({ nodes, edges }, null, 2) })
  const doImport = () => { try { const p = JSON.parse(io.text) as { nodes: Node[]; edges: Edge[] }; if (Array.isArray(p.nodes) && Array.isArray(p.edges)) { setNodes(p.nodes); setEdges(p.edges); setIo(s => ({ ...s, open: false })) } } catch { /* keep open */ } }
  const download = () => { const b = new Blob([JSON.stringify({ nodes, edges }, null, 2)], { type: 'application/json' }); const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = 'campaign-flow.json'; a.click(); URL.revokeObjectURL(a.href) }

  const generate = async () => {
    if (!aiText.trim()) return
    setAiBusy(true); setAiErr(null)
    try {
      const r = await fetch('/api/flow-builder/generate', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ prompt: aiText }) })
      const j = await r.json()
      if (!r.ok) { setAiErr(j.error || 'Generation failed.'); return }
      setPreview(layoutFlow(j.nodes || [], j.edges || []))   // proof-check before applying
    } catch { setAiErr('Request failed.') } finally { setAiBusy(false) }
  }
  const applyPreview = () => { if (preview) { setNodes(preview.nodes); setEdges(preview.edges); setSelId(null); setPreview(null) } }

  const btn = { textTransform: 'none' as const, fontSize: '0.72rem', fontWeight: 700, borderColor: colors.border2, color: colors.fg2 }
  const fieldSx = { '& .MuiInputBase-root': { fontSize: '0.8rem', color: colors.fg1 }, '& .MuiInputLabel-root': { fontSize: '0.8rem', color: colors.fg3 }, '& .MuiOutlinedInput-notchedOutline': { borderColor: colors.border2 } }

  return (
    <Box sx={{ display: 'flex', height: embedded ? '100%' : '100vh', minHeight: 0, bgcolor: colors.bg0 }}>
      {/* palette */}
      <Box sx={{ width: 236, flex: 'none', borderRight: `1px solid ${colors.border1}`, bgcolor: colors.bg2, p: 1.25, overflowY: 'auto' }}>
        <Typography sx={{ fontSize: '0.7rem', fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color: colors.greenBright, mb: 0.5, px: 0.5 }}>Flow Builder</Typography>
        <Typography sx={{ fontSize: '0.6rem', color: colors.fg4, mb: 1.25, px: 0.5 }}>Drag onto the canvas, or click to add. Select a node to configure it.</Typography>
        {GROUPS.map(g => {
          const open = !!openGroups[g.group]
          return (
            <Box key={g.group} sx={{ mb: 0.5 }}>
              <Box component="button" onClick={() => setOpenGroups(s => ({ ...s, [g.group]: !s[g.group] }))}
                sx={{ display: 'flex', alignItems: 'center', gap: 1, width: '100%', cursor: 'pointer', bgcolor: open ? colors.bg1 : 'transparent', border: 'none', borderRadius: 1.5, px: 1, py: 0.85, color: colors.fg2, textAlign: 'left', '&:hover': { bgcolor: colors.bg1 } }}>
                <Box sx={{ width: 8, height: 8, borderRadius: '2px', bgcolor: g.accent, flex: 'none' }} />
                <Typography sx={{ flex: 1, fontSize: '0.74rem', fontWeight: 700 }}>{g.group}</Typography>
                <Typography sx={{ fontSize: '0.62rem', color: colors.fg4 }}>{g.keys.length}</Typography>
                <Box sx={{ fontSize: '0.7rem', color: colors.fg3, transform: open ? 'rotate(90deg)' : 'none', transition: 'transform .12s' }}>▸</Box>
              </Box>
              {open && (
                <Stack sx={{ gap: 0.4, mt: 0.4, mb: 0.75, pl: 1 }}>
                  {g.keys.map(k => {
                    const s = SPEC_BY_KEY[k]
                    return (
                      <Box key={k} draggable
                        onDragStart={e => e.dataTransfer.setData('application/flow', k)}
                        onClick={() => spawn(k, { x: 500 + Math.round((idRef.current % 5) * 16), y: 60 + Math.round((idRef.current % 9) * 16) })}
                        sx={{ cursor: 'grab', userSelect: 'none', px: 1, py: 0.6, borderRadius: 1, bgcolor: colors.bg1, borderLeft: `3px solid ${g.accent}`, color: colors.fg2, fontSize: '0.73rem', fontWeight: 600, display: 'flex', justifyContent: 'space-between', gap: 1, '&:hover': { color: colors.fg1, bgcolor: colors.bg3 }, '&:active': { cursor: 'grabbing' } }}>
                        <span>{s.label}</span>
                        {s.io === 'branch' && <span style={{ color: colors.fg4, fontSize: 10 }}>⑂</span>}
                      </Box>
                    )
                  })}
                </Stack>
              )}
            </Box>
          )
        })}
      </Box>

      {/* canvas */}
      <Box sx={{ flex: 1, minWidth: 0 }} onDrop={onDrop} onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = 'move' }}>
        <ReactFlow
          nodes={nodes} edges={edges} nodeTypes={nodeTypes}
          onNodesChange={onNodesChange} onEdgesChange={onEdgesChange} onConnect={onConnect}
          onSelectionChange={({ nodes: ns }) => setSelId(ns[0]?.id ?? null)}
          colorMode="dark" fitView deleteKeyCode={['Backspace', 'Delete']} proOptions={{ hideAttribution: true }}
        >
          <Background variant={BackgroundVariant.Dots} gap={20} size={1} color={colors.border3} />
          <MiniMap pannable zoomable maskColor="rgba(0,0,0,0.6)" style={{ background: colors.bg2, border: `1px solid ${colors.border1}` }}
            nodeColor={n => SPEC_BY_KEY[(n.data as { specKey: string }).specKey]?.accent || colors.green} />
          <Controls style={{ background: colors.bg1, border: `1px solid ${colors.border2}` }} />
          <Panel position="top-left">
            <Stack sx={{ width: 320, bgcolor: colors.bg2, p: 1.25, borderRadius: 2, border: `1px solid ${colors.border1}`, gap: 0.75 }}>
              <Stack direction="row" sx={{ alignItems: 'center', gap: 0.75 }}>
                <Box sx={{ width: 7, height: 7, borderRadius: '50%', bgcolor: colors.glow }} />
                <Typography sx={{ fontSize: '0.72rem', fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase', color: colors.greenBright }}>Build with Claude</Typography>
              </Stack>
              <TextField multiline minRows={2} maxRows={5} size="small" fullWidth value={aiText}
                onChange={e => setAiText(e.target.value)}
                placeholder="Describe the flow — e.g. Dial, if answered play a message, press 1 marks a lead and sends WhatsApp, otherwise hang up."
                sx={{ '& .MuiInputBase-root': { fontSize: '0.76rem', color: colors.fg1 }, '& .MuiOutlinedInput-notchedOutline': { borderColor: colors.border2 } }} />
              <Stack direction="row" sx={{ gap: 1, alignItems: 'center' }}>
                <Button size="small" variant="contained" disabled={aiBusy || !aiText.trim()} onClick={generate}
                  sx={{ textTransform: 'none', fontSize: '0.72rem', fontWeight: 700, bgcolor: colors.green, color: colors.greenInk, '&.Mui-disabled': { bgcolor: colors.bg3, color: colors.fg4 } }}>
                  {aiBusy ? 'Generating…' : 'Generate & preview'}
                </Button>
                <Typography sx={{ fontSize: '0.62rem', color: colors.fg4 }}>you approve before it applies</Typography>
              </Stack>
              {aiErr && <Typography sx={{ fontSize: '0.68rem', color: colors.negative }}>{aiErr}</Typography>}
            </Stack>
          </Panel>
          <Panel position="top-right">
            <Stack direction="row" sx={{ gap: 1, bgcolor: colors.bg2, p: 0.75, borderRadius: 2, border: `1px solid ${colors.border1}` }}>
              <Button size="small" variant="outlined" sx={btn} onClick={doExport}>Export JSON</Button>
              <Button size="small" variant="outlined" sx={btn} onClick={() => setIo({ open: true, mode: 'import', text: '' })}>Import</Button>
              <Button size="small" variant="outlined" sx={{ ...btn, borderColor: colors.negative, color: colors.negative }} onClick={() => { setNodes([]); setEdges([]); setSelId(null) }}>Clear</Button>
            </Stack>
          </Panel>
        </ReactFlow>
      </Box>

      {/* inspector */}
      <Box sx={{ width: 268, flex: 'none', borderLeft: `1px solid ${colors.border1}`, bgcolor: colors.bg2, p: 2, overflowY: 'auto' }}>
        <Typography sx={{ fontSize: '0.7rem', fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color: colors.fg3, mb: 1.5 }}>Inspector</Typography>
        {!selected || !selSpec ? (
          <Typography sx={{ fontSize: '0.8rem', color: colors.fg4 }}>Select a node to configure how it behaves in the pipeline.</Typography>
        ) : (
          <>
            <Stack direction="row" sx={{ alignItems: 'center', gap: 1, mb: 0.5 }}>
              <Box sx={{ width: 9, height: 9, borderRadius: '2px', bgcolor: selSpec.accent }} />
              <Typography sx={{ fontSize: '0.95rem', fontWeight: 700, color: colors.fg1 }}>{selSpec.label}</Typography>
            </Stack>
            <Typography sx={{ fontSize: '0.66rem', color: colors.fg4, textTransform: 'uppercase', letterSpacing: '0.06em', mb: 2 }}>{selSpec.group} · {selSpec.io}</Typography>

            <Stack sx={{ gap: 1.75 }}>
              {selSpec.fields.length === 0 && <Typography sx={{ fontSize: '0.76rem', color: colors.fg4 }}>{selSpec.io === 'branch' ? 'Routes by wiring its labelled outputs.' : 'No parameters.'}</Typography>}
              {selSpec.fields.map(f => {
                const val = (selected.data as { params?: Record<string, ParamValue> }).params?.[f.key]
                if (f.type === 'toggle') return (
                  <FormControlLabel key={f.key} sx={{ m: 0, justifyContent: 'space-between', '& .MuiFormControlLabel-label': { fontSize: '0.8rem', color: colors.fg2 } }} labelPlacement="start"
                    control={<Switch size="small" checked={!!val} onChange={e => setParam(f.key, e.target.checked)} />} label={f.label} />
                )
                if (f.type === 'select') return (
                  <TextField key={f.key} select size="small" fullWidth label={f.label} value={String(val ?? f.def)} onChange={e => setParam(f.key, e.target.value)} sx={fieldSx}>
                    {f.options.map(o => <MenuItem key={o} value={o} sx={{ fontSize: '0.8rem' }}>{o}</MenuItem>)}
                  </TextField>
                )
                if (f.type === 'number') return (
                  <TextField key={f.key} type="number" size="small" fullWidth label={`${f.label}${f.unit ? ` (${f.unit})` : ''}`} value={Number(val ?? f.def)} onChange={e => setParam(f.key, Number(e.target.value))} sx={fieldSx} />
                )
                return (
                  <TextField key={f.key} size="small" fullWidth label={f.label} placeholder={f.placeholder} value={String(val ?? '')} onChange={e => setParam(f.key, e.target.value)} sx={fieldSx} />
                )
              })}
              {selSpec.io === 'branch' && (
                <Box>
                  <Typography sx={{ fontSize: '0.66rem', color: colors.fg4, textTransform: 'uppercase', letterSpacing: '0.06em', mb: 0.75 }}>Outputs</Typography>
                  <Stack sx={{ gap: 0.5 }}>
                    {(selSpec.outputs || []).map(o => (
                      <Stack key={o} direction="row" sx={{ alignItems: 'center', gap: 1 }}>
                        <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: colorFor(o) }} />
                        <Typography sx={{ fontSize: '0.78rem', color: colors.fg2 }}>{o}</Typography>
                      </Stack>
                    ))}
                  </Stack>
                </Box>
              )}
              <Button size="small" variant="outlined" onClick={deleteSelected} sx={{ mt: 1, textTransform: 'none', borderColor: colors.negative, color: colors.negative }}>Delete node</Button>
            </Stack>
          </>
        )}
      </Box>

      <Dialog open={io.open} onClose={() => setIo(s => ({ ...s, open: false }))} maxWidth="sm" fullWidth
        slotProps={{ paper: { sx: { bgcolor: colors.bg1, border: `1px solid ${colors.border2}`, backgroundImage: 'none' } } }}>
        <Box sx={{ p: 2.5 }}>
          <Typography sx={{ fontWeight: 700, mb: 1.5, color: colors.fg1 }}>{io.mode === 'export' ? 'Exported flow (JSON)' : 'Import flow (paste JSON)'}</Typography>
          <TextField multiline minRows={12} fullWidth value={io.text} onChange={e => setIo(s => ({ ...s, text: e.target.value }))}
            slotProps={{ input: { readOnly: io.mode === 'export', sx: { fontFamily: 'monospace', fontSize: '0.72rem', color: colors.fg2 } } }} />
          <Stack direction="row" sx={{ gap: 1, mt: 2, justifyContent: 'flex-end' }}>
            {io.mode === 'export'
              ? <Button variant="contained" sx={{ textTransform: 'none', bgcolor: colors.green, color: colors.greenInk }} onClick={download}>Download .json</Button>
              : <Button variant="contained" sx={{ textTransform: 'none', bgcolor: colors.green, color: colors.greenInk }} onClick={doImport}>Load flow</Button>}
          </Stack>
        </Box>
      </Dialog>

      {/* proof-check: preview Claude's flow before it replaces the canvas */}
      <Dialog open={!!preview} onClose={() => setPreview(null)} maxWidth="lg" fullWidth
        slotProps={{ paper: { sx: { bgcolor: colors.bg1, border: `1px solid ${colors.border2}`, backgroundImage: 'none' } } }}>
        <Box sx={{ p: 2.5 }}>
          <Stack direction="row" sx={{ alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
            <Typography sx={{ fontWeight: 700, color: colors.fg1 }}>Claude proposed this flow — proof-check it</Typography>
            <Typography sx={{ fontSize: '0.72rem', color: colors.fg3 }}>{preview?.nodes.length ?? 0} nodes · {preview?.edges.length ?? 0} connections</Typography>
          </Stack>
          <Box sx={{ height: 460, border: `1px solid ${colors.border1}`, borderRadius: 1.5, overflow: 'hidden' }}>
            {preview && (
              <ReactFlowProvider>
                <ReactFlow nodes={preview.nodes} edges={preview.edges} nodeTypes={nodeTypes} colorMode="dark" fitView
                  nodesDraggable={false} nodesConnectable={false} elementsSelectable={false} proOptions={{ hideAttribution: true }}>
                  <Background variant={BackgroundVariant.Dots} gap={20} size={1} color={colors.border3} />
                </ReactFlow>
              </ReactFlowProvider>
            )}
          </Box>
          <Stack direction="row" sx={{ gap: 1, mt: 2, justifyContent: 'flex-end' }}>
            <Button variant="outlined" sx={{ ...btn, borderColor: colors.border2 }} onClick={() => setPreview(null)}>Discard</Button>
            <Button variant="contained" sx={{ textTransform: 'none', fontWeight: 700, bgcolor: colors.green, color: colors.greenInk }} onClick={applyPreview}>Apply to canvas</Button>
          </Stack>
        </Box>
      </Dialog>
    </Box>
  )
}

export default function FlowBuilder({ embedded = false }: { embedded?: boolean }) {
  return <ReactFlowProvider><Builder embedded={embedded} /></ReactFlowProvider>
}
