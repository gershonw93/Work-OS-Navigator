# SyteNav architecture map

Two deliverables built from a full read of the repo, kept in one place so they
cannot drift apart:

| File | What it is | Who it's for |
| --- | --- | --- |
| `architecture.html` | Self-contained interactive map. Open it in a browser - no server, no build step, no network. | Humans |
| `architecture.json` | The same graph as data: `{ meta, nodes, edges, flows }`. | AI agents and tooling |
| `architecture.template.html` | The page shell with a `__GRAPH_JSON__` placeholder. | Editing the UI |
| `build.mjs` | Validates the graph and inlines it into the template. | Regenerating |

`architecture.json` is the source of truth. `architecture.html` is generated -
never hand-edit it.

## Regenerate

```bash
node docs/architecture/build.mjs
```

The build fails loudly on a broken graph: duplicate ids, an edge pointing at a
node that does not exist, a flow step referencing a missing node or edge, an
unknown layer, or a node no edge touches. That check is the whole point - a
dangling reference would silently break a flow highlight instead of erroring.

## Using the map

- **Flows panel** (right) lists 25 end-to-end paths grouped by category. Pick
  one and the diagram dims everything else, numbers the nodes in order, and
  labels the edges along the path.
- **Prev / Next** (or `↑` `↓` / `j` `k`) walks the path one step at a time,
  panning to each component.
- **Click a node** for its summary, source paths, tables, everything it calls,
  everything that calls it, and which flows it takes part in.
- **Hover** for a quick tooltip.
- **Search** (top right) filters components by label, summary, path or table.
- **Legend tab** carries the stats, per-layer visibility toggles, edge-kind key
  and the codebase conventions worth knowing before you change anything.
- `F` fits the view, `Esc` clears the selection. Scroll or pinch to zoom, drag
  to pan.

## Structure of the graph

Nodes sit in eight left-to-right layers: actors → edge → app shells → UI
surfaces → API layer → server libraries → data plane → external services. Any
renderer can reproduce the layout from `layer` + `order`; the rule is written
into `meta.layout`.

`meta.conventions` is the part most worth reading before touching code - it
records how auth, database access, authorization, no-account token links and
the activity/notification write paths actually work, including where the
server-side permission checks are and are not wired in.

## Keeping it current

When a change adds a component, an integration, or a new end-to-end path, edit
`architecture.json` and re-run the build. Adding a flow is usually the highest
value: the node list changes slowly, the flows are what explain the system.
