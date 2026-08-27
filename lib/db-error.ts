// ─────────────────────────────────────────────────────────────────────────────
// Turning a Postgres error into something a builder can act on.
//
// This existed because of a real one. Adding a subcontractor without a contract
// amount produced, in a browser alert() box:
//
//   Could not add subcontractor: null value in column "contract_amount" of
//   relation "subcontracts" violates not-null constraint
//
// Every word of that is true and none of it is usable. It names a column, not a
// field; it says "violates not-null constraint", not "you left the price out";
// and it does not say what to do next. Somebody trying to line up a plumber
// reads it as "the app is broken", which is roughly the right conclusion for
// the wrong reason.
//
// The rule here: a message a user sees must name the FIELD as the form labels
// it, and say what to do. Where nothing sensible can be said, fall back to the
// raw text - an ugly message beats a vague one, because the ugly one can be
// pasted into a bug report.
// ─────────────────────────────────────────────────────────────────────────────

/** Column name -> the label the form actually shows for it. */
const FIELD_LABELS: Record<string, string> = {
  contract_amount: 'Contract Amount',
  company_name: 'Company',
  company_id: 'Subcontractor',
  project_id: 'Project',
  scope: 'Scope of Work',
  trade: 'Trade',
  title: 'Title',
  amount: 'Amount',
  due_date: 'Due date',
  start_date: 'Start Date',
  end_date: 'End Date',
  name: 'Name',
  email: 'Email',
}

function label(column: string): string {
  return FIELD_LABELS[column] ?? column.replace(/_/g, ' ')
}

export interface DbErrorLike {
  message?: string | null
  code?: string | null
  details?: string | null
}

/**
 * A sentence worth showing somebody.
 *
 * Handles the constraint failures that actually reach users. Anything else
 * comes back as-is rather than being flattened into "Something went wrong",
 * which tells whoever has to debug it precisely nothing.
 */
export function friendlyDbError(err: DbErrorLike | null | undefined): string {
  const raw = (err?.message ?? '').trim()
  if (!raw) return 'Something went wrong saving that. Try again.'

  // null value in column "contract_amount" of relation "subcontracts" violates not-null constraint
  const notNull = raw.match(/null value in column "([^"]+)"/i)
  if (notNull) return `${label(notNull[1])} is required - fill it in and try again.`

  // duplicate key value violates unique constraint "companies_name_key"
  if (/duplicate key value/i.test(raw)) {
    const col = raw.match(/Key \((\w+)\)/)?.[1]
    return col
      ? `That ${label(col).toLowerCase()} is already used. Pick a different one.`
      : 'That already exists. Pick a different name.'
  }

  // insert or update on table "x" violates foreign key constraint
  if (/violates foreign key constraint/i.test(raw)) {
    return 'Something this refers to no longer exists. Reload the page and try again.'
  }

  // new row for relation "x" violates check constraint "x_status_check"
  const check = raw.match(/violates check constraint "([^"]+)"/i)
  if (check) return `That combination is not allowed (${check[1]}). Check the fields and try again.`

  // 42703: undefined column - a migration has not been applied.
  if (err?.code === '42703') {
    return 'This feature needs a database update that has not been applied yet. Tell support.'
  }

  return raw
}
