import type { ToolDef, WriteToolDef } from '../tool-kit'
import { SELECTIONS_READ, SELECTIONS_WRITE } from './selections'
import { RFIS_SUBMITTALS_READ, RFIS_SUBMITTALS_WRITE } from './rfis-submittals'
import { PERMITS_INSPECTIONS_READ, PERMITS_INSPECTIONS_WRITE } from './permits-inspections'
import { CUSTOMERS_PROJECTS_READ, CUSTOMERS_PROJECTS_WRITE } from './customers-projects'
import { MATERIALS_EQUIPMENT_READ, MATERIALS_EQUIPMENT_WRITE } from './materials-equipment'
import { BIDS_PAYAPPS_READ, BIDS_PAYAPPS_WRITE } from './bids-payapps'

// Every area's tools, in one list the dispatcher appends to its own. A new area
// is one file here and one import above.
export const AREA_TOOLS: (ToolDef | WriteToolDef)[] = [
  ...SELECTIONS_READ, ...SELECTIONS_WRITE, ...RFIS_SUBMITTALS_READ, ...RFIS_SUBMITTALS_WRITE, ...PERMITS_INSPECTIONS_READ, ...PERMITS_INSPECTIONS_WRITE, ...CUSTOMERS_PROJECTS_READ, ...CUSTOMERS_PROJECTS_WRITE, ...MATERIALS_EQUIPMENT_READ, ...MATERIALS_EQUIPMENT_WRITE, ...BIDS_PAYAPPS_READ, ...BIDS_PAYAPPS_WRITE,
]
