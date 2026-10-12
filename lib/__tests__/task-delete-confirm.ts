// "deleting a task is way too easy - i need the are you sure pop up"

import { ok, done, code } from './_helpers'

const page = code('app/(dashboard)/projects/[id]/tasks/page.tsx')
const del = page.slice(page.indexOf('function deleteTask('), page.indexOf('function openInvoiceModal('))
ok(/guardDelete\(async \(\) => \{/.test(del) && del.indexOf('guardDelete(') < del.indexOf("method: 'DELETE'"),
  'THE ASK: the trash can asks "are you sure" before the DELETE is sent')
ok(/title: 'Delete this task\?'/.test(del) && /confirmLabel: 'Delete task'/.test(del), '...naming what is deleted, with a button that says so')
const nativeAsk = new RegExp('\\bconfirm' + '\\(')
ok(!nativeAsk.test(del), '...through the app dialog, never the blocking native one')
ok(del.indexOf('if (!res.ok)') > -1 && del.indexOf('if (!res.ok)') < del.indexOf('setTasks(prev => prev.filter'),
  'a task leaves the list only once the server says it is gone')
ok((page.match(/deleteTask\(task\.id\)/g) ?? []).length === 2 && !/fetch\([^)]*tasks\/\$\{[^}]+\}`, \{\s*method: 'DELETE'/.test(page.replace(del, '')),
  'every trash can goes through that one function - there is no second, unguarded delete')
ok(/hideDelete = !perms\.loading && !perms\.error && !can\('tasks', 'delete'\)/.test(page),
  'the trash can is hidden only when we KNOW the person may not delete')

const route = code('app/api/projects/[id]/tasks/[taskId]/route.ts')
const routeDel = route.slice(route.indexOf('export async function DELETE('))
ok(/requirePermission\(db, request, 'tasks', 'delete'\)/.test(routeDel) &&
  routeDel.indexOf("requirePermission(") < routeDel.indexOf(".delete()"),
  'the route asks for tasks: delete BEFORE deleting - it asked nothing, so any account could delete any task')
ok(!/error: error\.message/.test(routeDel), '...and a failure is not a raw database sentence')

done()
