import type { ToolDef, WriteToolDef } from '../tool-kit'

// Claude's tools for this area. Reads go in READ, adds and edits in WRITE; the
// dispatcher in ../tools.ts gates every one before it runs.
export const PERMITS_INSPECTIONS_READ: ToolDef[] = []
export const PERMITS_INSPECTIONS_WRITE: WriteToolDef[] = []
