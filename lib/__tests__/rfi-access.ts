// The RFI routes checked one thing - "is somebody signed in?" - and nothing
// else. Any account could list another company's RFIs, file one into a job it
// was not on under any company name (company_id / company_name came off the
// body), answer one, approve the change order riding on it, mint the answer
// link, or delete it. `requirePermission` alone cannot close it: a sub asks
// RFIs on a job it does not own, with `rfis: view` only. So lib/rfi-access.ts
// answers which SIDE the caller is on, and each route asks it.

import { ok, done, code } from './_helpers'

const access = code('lib/rfi-access.ts')
ok(/ownsProject\(actor\.companyId, project\)\) return \{ side: 'gc', actor \}/.test(access),
  'the owning company is the GC side')
ok(/from\('subcontracts'\)\.select\('id'\)\.eq\('project_id', projectId\)\.eq\('company_id', actor\.companyId\)/.test(access),
  '...a company holding a subcontract on the job is the sub side')
ok(/You are not on this job\.' \}, \{ status: 403 \}/.test(access), '...and anybody else is refused')
ok(/who\.side !== 'gc'/.test(access) && /actorCan\(who\.actor, 'rfis', action\)/.test(access),
  'GC-only actions refuse a sub and ask the GC staff member\'s own permission')

const list = code('app/api/projects/[id]/rfis/route.ts')
// The bodies moved to lib/writes/rfi.ts (shared with Claude); the gates stayed in the routes.
const writes = code('lib/writes/rfi.ts')
ok(!/db\.auth\.getUser\(token\)/.test(list), 'THE BUG: the list/create route no longer settles for "signed in"')
ok((list.match(/await rfiSide\(db, request, params\.id\)/g) ?? []).length === 2, '...both GET and POST ask which side the caller is on')
ok(/if \(who\.side === 'sub'\) q = q\.eq\('company_id', who\.actor\.companyId\)/.test(list),
  'a sub lists only its own company\'s RFIs')
ok([list, writes].every(src => !/company_id,\s*\n?\s*attachments,\s*\n\s*\} = body/.test(src) && !/\bcompany_name,\s*\n\s*company_id,\s*\n\s*attachments,\s*\n\s*\} = body/.test(src)
  && !/submitted_by_name,\s*\n[^}]*\} = body/.test(src)),
  'THE ESCALATION: company and submitter are not read from the body')
ok(/const company_id = who\.side === 'sub' \? who\.actor\.companyId : null/.test(list),
  '...the company an RFI is filed under is the caller\'s own')
ok(/actorCan\(who\.actor, 'rfis', 'create'\)/.test(list), 'GC staff need rfis:create to ask one')

const one = code('app/api/projects/[id]/rfis/[rfiId]/route.ts')
ok(/rfiGcGate\(db, request, params\.id, 'edit'\)/.test(one), 'answering / approving a change order is GC-only, with rfis:edit')
ok(/rfiGcGate\(db, request, params\.id, 'delete'\)/.test(one), 'deleting is GC-only, with rfis:delete')
ok(!/getUser\(token\)/.test(one), '...neither settles for "signed in" any more')
ok(/CO_STATUSES\.has\(change_order_status\)/.test(writes), 'a change order decision must be a real one')
ok(/if \(subject !== undefined\) updates\.subject/.test(writes) && /if \(isAnswer\) \{/.test(writes),
  'the Edit dialog\'s subject and description save, and an edit is not stamped as an answer')

const link = code('app/api/projects/[id]/rfis/[rfiId]/answer-link/route.ts')
ok(/rfiGcGate\(db, request, params\.id, 'edit'\)/.test(link), 'minting the answer link is the GC answering it')

const page = code('app/(dashboard)/projects/[id]/rfis/page.tsx')
ok((page.match(/if \(!res\.ok\)/g) ?? []).length >= 4, 'the GC page reports a refusal instead of closing as if it saved')

done()
