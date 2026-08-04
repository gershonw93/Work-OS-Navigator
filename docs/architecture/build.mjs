// Inlines architecture.json into architecture.template.html so the rendered
// map is a single self-contained file with no network dependencies.
//
//   node docs/architecture/build.mjs
//
// Edit architecture.json (the source of truth) or the template, then re-run.

import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const graphPath = join(here, 'architecture.json')
const tplPath = join(here, 'architecture.template.html')
const outPath = join(here, 'architecture.html')

const graph = JSON.parse(readFileSync(graphPath, 'utf8'))

// ── Integrity checks: a broken reference silently breaks a flow highlight ──
const nodeIds = new Set(graph.nodes.map(n => n.id))
const edgeIds = new Set(graph.edges.map(e => e.id))
const layerIds = new Set(graph.meta.layout.layers.map(l => l.id))
const errors = []

if (nodeIds.size !== graph.nodes.length) errors.push('duplicate node ids')
if (edgeIds.size !== graph.edges.length) errors.push('duplicate edge ids')
for (const n of graph.nodes) {
  if (!layerIds.has(n.layer)) errors.push(`node ${n.id}: unknown layer "${n.layer}"`)
}
for (const e of graph.edges) {
  if (!nodeIds.has(e.from)) errors.push(`edge ${e.id}: unknown from "${e.from}"`)
  if (!nodeIds.has(e.to)) errors.push(`edge ${e.id}: unknown to "${e.to}"`)
}
for (const f of graph.flows) {
  for (const s of f.steps) {
    if (!nodeIds.has(s.node)) errors.push(`flow ${f.id} step ${s.n}: unknown node "${s.node}"`)
    if (s.edge && !edgeIds.has(s.edge)) errors.push(`flow ${f.id} step ${s.n}: unknown edge "${s.edge}"`)
  }
}
const touched = new Set(graph.edges.flatMap(e => [e.from, e.to]))
const orphans = graph.nodes.filter(n => !touched.has(n.id)).map(n => n.id)
if (orphans.length) errors.push(`nodes with no edges: ${orphans.join(', ')}`)

if (errors.length) {
  console.error('architecture.json failed validation:')
  for (const e of errors) console.error('  - ' + e)
  process.exit(1)
}

// `<` is escaped so no string in the graph can close the <script> block early.
const inline = JSON.stringify(graph).replace(/</g, '\\u003c')
const html = readFileSync(tplPath, 'utf8').replace('__GRAPH_JSON__', () => inline)

if (html.includes('__GRAPH_JSON__')) {
  console.error('template placeholder __GRAPH_JSON__ not found')
  process.exit(1)
}

writeFileSync(outPath, html)
const kb = (Buffer.byteLength(html) / 1024).toFixed(0)
console.log(
  `architecture.html written (${kb} KB) — ${graph.nodes.length} nodes, ` +
  `${graph.edges.length} edges, ${graph.flows.length} flows, ` +
  `${graph.flows.reduce((s, f) => s + f.steps.length, 0)} steps`,
)
