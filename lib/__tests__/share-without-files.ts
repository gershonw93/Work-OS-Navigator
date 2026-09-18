/**
 * SHARING WITHOUT ATTACHING FILES, AND THE RECORD BEING SOMEWHERE A PERSON LOOKS.
 *
 * Two reports, one change. First: a scope-change broadcast shipped with its
 * record in the job history, behind a clock icon in the project header -
 * "so again where do i see the record?". Then the better idea: "why dnt we make
 * it simpler and adjust the sharing tab to be able to share withut attachung
 * files".
 *
 * So the Sharing tab is now the one page that answers "what has gone out on
 * this job": documents are optional on a share, and broadcasts are listed
 * beside them.
 *
 * WHAT THIS PINS, each of which is a way the change can silently come undone:
 *   - a share is documents OR words and never NEITHER, asked by the form AND
 *     the route
 *   - the button is not greyed out on an empty selection (a disabled button
 *     explains nothing, and "nothing picked" is now a legitimate send)
 *   - the copy stops claiming documents when there are none - in the list, on
 *     the link the recipient opens, and in the letter that carries it
 *   - the broadcast log route's gate MATCHES the page's own gate, or a PM opens
 *     Sharing and half of it fails to load
 *   - loading, failed and empty stay three different facts
 */
import { ok, done, code, read, exists } from './_helpers'
import { shareProblem, shareContentsLabel, shareActionLabel, isUpdateOnly } from '../share-contents'
import { noticeRecord, noticeReached } from '../scope-notice'

const ROUTE = 'app/api/file-shares/route.ts'
const SEND = 'app/api/file-shares/[id]/send/route.ts'
const MODAL = 'components/files/share-files-modal.tsx'
const PAGE = 'app/(dashboard)/projects/[id]/sharing/page.tsx'
const TOKEN_PAGE = 'app/share/[token]/page.tsx'
const LOG = 'app/api/projects/[id]/scope-notice/log/route.ts'
const DIALOG = 'components/projects/notify-team-dialog.tsx'

console.log('\n\x1b[1mshare-without-files\x1b[0m')

// ---------------------------------------------------------------- the rule
ok(shareProblem({ files: [{}], message: '' }) === null,
  'documents with no message is a share')
ok(shareProblem({ files: [], message: 'The slab height moved half an inch.' }) === null,
  'THE POINT: words with no documents is a share too')
ok(typeof shareProblem({ files: [], message: '' }) === 'string',
  '...but neither is not - an empty link opens on nothing')
ok(typeof shareProblem({ files: [], message: 'ok' }) === 'string',
  '...and with no documents the message IS the share, so it has to say something')
ok(shareProblem({ files: [{}], message: 'ok' }) === null,
  'a short note ALONGSIDE documents is fine - the documents are the content there')
ok(shareProblem({ files: null, message: null }) !== null,
  'a body with neither key is refused rather than throwing')

// "0 documents" reads like a send that lost its attachments.
ok(!/^0\b/.test(shareContentsLabel(0)) && /update/i.test(shareContentsLabel(0)),
  'a share with no files is described as an update, never as "0 documents"')
ok(shareContentsLabel(1) === '1 document' && shareContentsLabel(3) === '3 documents',
  '...and the counted case still counts, singular and plural')
ok(isUpdateOnly(0) && !isUpdateOnly(1), 'isUpdateOnly is about the count and nothing else')
ok(shareActionLabel(0) !== shareActionLabel(2),
  'the verb on the button differs, because pressing it does a different thing')

// ---------------------------------------------------------------- the route
{
  const src = code(ROUTE)
  ok(/shareProblem\(\s*\{/.test(src), 'the ROUTE asks the same function the form does')
  ok(!src.includes('Pick at least one document to send'),
    'THE BUG: the hard refusal on an empty file list is gone')
  ok(/files\.length\s*\?/.test(src),
    'the default title knows which kind of send it is naming')
}

// ---------------------------------------------------------------- the letter
{
  const src = code(SEND)
  ok(/const update = count === 0/.test(src),
    'the email branches on whether anything is attached')
  ok(!/has shared \$\{count \? /.test(src),
    'THE BUG: "has shared some documents with you" over a link with none of them')
  ok(/update\s*\?[\s\S]{0,200}sent you an update/.test(src),
    '...it says an update was sent instead')
  ok(/ctaLabel: update \?/.test(src),
    'and the button in the letter names what it opens')
}

// ---------------------------------------------------------------- the form
{
  const src = code(MODAL)
  ok(/shareProblem\(\s*\{\s*files: chosen/.test(src),
    'the form asks at the field, so the answer is not a message about a whole request')
  // It survives in `addToExisting` on purpose and nowhere else, so counting is
  // the assertion: a second copy means the new-share path grew one back.
  ok(src.split("Pick at least one document").length - 1 === 1,
    'the blanket refusal exists exactly once, in the add-to-existing path')
  ok(/disabled=\{saving \|\| \(!!addTo && picked\.size === 0\)\}/.test(src),
    'THE BUG: the send button is no longer greyed out on an empty selection')
  ok(/Documents <span[^>]*>\(optional/.test(src),
    'a field is marked or it is guessed at - documents say they are optional')
  ok(/updateOnly[\s\S]{0,120}text-danger[\s\S]{0,40}\*/.test(src),
    '...and the message carries the * exactly when it is the whole share')
  ok(/shareActionLabel\(picked\.size\)/.test(src),
    'the button label is derived, not two hardcoded strings that can drift')
  ok(/addToExisting[\s\S]*?Pick at least one document/.test(read(MODAL)),
    'ADDING to an existing link still needs a document - that action really is about files')
}

// ---------------------------------------------------- what the recipient sees
{
  const src = code(TOKEN_PAGE)
  ok(/\{data\.files\.length > 0 && <>/.test(src),
    'THE BUG: "0 documents" over an empty box on the page the recipient opens')
  ok(/\{data\.message && \(/.test(src),
    '...the message still renders, because on an update it is the whole thing')
}

// ------------------------------------------------------------ the record
{
  ok(exists(LOG), 'there is a route that reads the broadcasts back')
  const src = code(LOG)
  // A page's gate has to COVER every route it loads from. Sharing loads
  // /api/file-shares, which is `files: view`; gating this on `plans: edit` -
  // the permission for SENDING a notice - would break the page for a reader.
  ok(/requirePermission\(db, request, 'files', 'view'\)/.test(src),
    "THE TRAP: the log route's gate matches the Sharing page's own, not the sender's")
  ok(!/'plans',\s*'edit'/.test(src),
    "...so somebody entitled to read this page is not refused half of it")
  ok(/project_activity/.test(src) && /scope_change_notice/.test(src),
    'it reads the existing history row - one fact, one home, no second table')
  ok(/console\.error/.test(src),
    'a refused query that nobody logs is indistinguishable from an empty one')
}

// noticeRecord is fed jsonb, which nothing type-checks.
{
  const r = noticeRecord({
    id: 'a', actor_name: ' Dana ', created_at: '2026-09-18T10:00:00Z',
    message: 'history sentence',
    metadata: { message: '  Slab dropped half an inch.  ', plan_name: 'A-101', told: ['Ray', 'Dana', '', null], failed: ['Ray'] },
  })
  ok(r.message === 'Slab dropped half an inch.', 'the typed message wins over the history sentence')
  ok(r.actorName === 'Dana', 'the actor is trimmed')
  ok(r.told.length === 2 && r.failed.length === 1, 'blank names are dropped from the list')  // Ray, Dana
  ok(noticeReached(r) === 1, 'reached is told minus failed')

  const bare = noticeRecord({ id: 'b', message: 'X flagged a change', created_at: '' })
  ok(bare.message === 'X flagged a change' && bare.told.length === 0,
    'a row with NO metadata still renders rather than taking the list down')
  ok(noticeRecord({}).actorName === 'Someone', 'and an empty row does not throw')
  ok(noticeReached({ told: [], failed: ['a', 'b'] }) === 0,
    'reached never goes negative, whatever the metadata says')
}

// ------------------------------------------------------------- the page
{
  const src = code(PAGE)
  ok(/scope-notice\/log/.test(src), 'the Sharing tab reads the broadcast log')
  ok(/shareContentsLabel\(count\)/.test(src),
    'and describes a fileless share through the shared labeller')
  ok(!/\$\{\(sh\.files \?\? \[\]\)\.length\} document/.test(src),
    'THE BUG: the row no longer spells "0 documents" itself')
  ok(/<NotifyTeamDialog/.test(src) && /onSent=\{load\}/.test(src),
    'the broadcast can be sent from here, and the list refreshes when it lands')
  // Three facts, not two.
  ok(/'loading' \| 'ready' \| 'failed'/.test(src),
    'loading, failed and empty stay three different facts')
  ok(/rows\.length === 0 && noticeState === 'failed' \? null/.test(src),
    'THE BUG: a failed read is never allowed to say "nothing sent from this job yet"')
  // A component declared inside a component is a new type on every render.
  ok(/^function NoticeRow\(/m.test(src) && /^function ShareRow\(/m.test(src),
    'the rows are hoisted, so React does not throw the DOM away on every render')
  ok(!/const NoticeRow = |const ShareRow = /.test(src),
    '...and are not re-declared inside the page')
  // Two controls must not answer one question: these reach different people,
  // and the labels are the only thing saying so.
  ok(/Tell everyone on this job/.test(src) && /Send to someone/.test(src),
    'the two doors are named by WHO they reach, not by what they are called internally')
  ok(/row-even/.test(src), 'a row of controls reaches both edges on a phone')
}

ok(/onSent\?\.\(\)/.test(code(DIALOG)),
  'the dialog tells its caller a send landed, rather than the list going stale')

done()
