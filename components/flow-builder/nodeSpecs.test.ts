import { test } from 'node:test'
import assert from 'node:assert/strict'
import { SPECS, SPEC_BY_KEY, GROUPS, defaultParams } from './nodeSpecs'
import { colorFor, layoutFlow } from './layout'
import { sanitizeGeneratedFlow } from './sanitizeFlow'

test('every spec key is unique and indexed', () => {
  const keys = SPECS.map(s => s.key)
  assert.equal(new Set(keys).size, keys.length)
  for (const spec of SPECS) {
    assert.equal(SPEC_BY_KEY[spec.key], spec)
  }
})

test('palette groups cover every spec exactly once', () => {
  const grouped = GROUPS.flatMap(g => g.keys)
  assert.deepEqual(grouped.sort(), SPECS.map(s => s.key).sort())
})

test('branch specs declare labelled outputs; start/end have no fields', () => {
  for (const spec of SPECS.filter(s => s.io === 'branch')) {
    assert.ok((spec.outputs?.length ?? 0) > 0, spec.key)
  }
  assert.deepEqual(SPEC_BY_KEY.start.fields, [])
  assert.deepEqual(SPEC_BY_KEY.end.fields, [])
  assert.equal(SPEC_BY_KEY.start.io, 'start')
  assert.equal(SPEC_BY_KEY.end.io, 'end')
})

test('defaultParams copies each field default', () => {
  const spec = SPEC_BY_KEY['amd-detection']
  assert.deepEqual(defaultParams(spec), { enabled: true, sensitivity: 'Medium' })
})

test('sanitizeGeneratedFlow drops invented types and dangling edges', () => {
  const { nodes, edges } = sanitizeGeneratedFlow({
    nodes: [
      { id: 'n1', specKey: 'start' },
      { id: 'n2', specKey: 'invented-node' },
      { specKey: 'end' },
      { id: 'n3', specKey: 'end' },
    ],
    edges: [
      { source: 'n1', target: 'n3' },
      { source: 'n1', target: 'missing' },
      { source: 'n2', target: 'n3' },
    ],
  })
  assert.deepEqual(nodes.map(n => n.id), ['n1', 'n3'])
  assert.deepEqual(edges, [{ source: 'n1', target: 'n3' }])
})

test('layoutFlow layers nodes by longest path and drops unknown edges', () => {
  const { nodes, edges } = layoutFlow(
    [
      { id: 'a', specKey: 'start' },
      { id: 'b', specKey: 'play-tts', params: { message: 'Hi' } },
      { id: 'c', specKey: 'end' },
    ],
    [
      { source: 'a', target: 'b' },
      { source: 'b', target: 'c', sourceHandle: 'Answered' },
      { source: 'a', target: 'ghost' },
    ],
  )
  const byId = Object.fromEntries(nodes.map(n => [n.id, n]))
  assert.equal(byId.a.position.y, 40)
  assert.equal(byId.b.position.y, 160)
  assert.equal(byId.c.position.y, 280)
  assert.equal(edges.length, 2)
  const data = byId.b.data as { params: { message: string } }
  assert.equal(data.params.message, 'Hi')
})

test('colorFor marks success vs failure handles', () => {
  assert.notEqual(colorFor('Answered'), colorFor('No Answer'))
  assert.notEqual(colorFor('match'), colorFor('else'))
  assert.equal(colorFor('pass'), colorFor('Answered'))
})
