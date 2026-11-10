// "for permit contacts it should have a setting on how to apply - in person or
// in email and it will reflect here so u cant email them only with a warning",
// and "when i start typing issuing authority it should connect to my directory".

import { applyHowOf, applyLabel, cleanApplyMethod, cleanApplyUrl, emailWarning } from '../permit-apply'
import { ok, done, code, read, combinedName } from './_helpers'

ok(cleanApplyMethod('in_person') === 'in_person' && cleanApplyMethod('fax') === null && cleanApplyMethod(undefined) === null,
  'only the three ways are a setting - anything else is "not said"')
ok(cleanApplyUrl('tomsriver.gov/permits') === 'https://tomsriver.gov/permits' && cleanApplyUrl('javascript:alert(1)') === null && cleanApplyUrl('') === null,
  'a website is an http(s) link or nothing')
ok(applyHowOf({ apply_method: 'portal', apply_url: 'x.gov' })?.url === 'https://x.gov/' && applyHowOf({ apply_method: 'in_person', apply_url: 'x.gov' })?.url === null,
  'a link only travels with "on their website"')
ok(applyHowOf(null) === null && applyHowOf({}) === null, 'a card nobody has set says nothing')
ok(applyLabel({ method: 'in_person', url: null }) === 'In person', 'the card prints the way in words')

ok(emailWarning({ method: 'in_person', url: null }, 'Toms River Township') === 'Toms River Township does NOT accept applications by email - only in person.'
  && /does NOT accept .* only on their website/.test(emailWarning({ method: 'portal', url: null }, 'Lakewood') ?? ''),
  'in person or website: Email it warns, short and blunt, naming the township ("stronger and shorter")')
ok(/border-danger\/40 bg-danger-tint px-3 py-2\.5 text-sm font-semibold text-danger/.test(code('components/permits/permit-panel.tsx')),
  '...in red, not amber')
ok(emailWarning({ method: 'email', url: null }, 'X') === null && emailWarning(null, 'X') === null,
  'by email, or not set: no warning - an unset card warns nobody')

const edit = code('lib/writes/directory-contact-edit.ts')
ok(/extraPatch\.apply_method = method/.test(edit) && /cleanApplyMethod\(body\.apply_method\)/.test(edit)
  && /\.\.\.\(\(\(cur as any\)\?\.extra/.test(edit),
  'the edit route stores the cleaned setting MERGED into extra - the jurisdiction and inspection types survive')

const route = code('app/api/projects/[id]/permits/[permitId]/email/route.ts')
ok(/select\('id, name, type, contact_email, extra'\)/.test(route) && /apply: named\.length === 1 \? applyHowOf\(named\[0\]\.extra\) : null/.test(route)
  && /warning: emailWarning\(found\.apply/.test(route),
  'Email it reads the setting off the ONE card named for the township; two cards with that name say nothing')
const panel = code('components/permits/permit-panel.tsx')
ok(/setWarning\(typeof out\.warning === 'string'/.test(panel) && /warning \? 'Email it anyway' : 'Send email'/.test(panel),
  'the dialog shows the warning and the button says Email it anyway - it warns, it does not refuse')

const dir = code('app/(dashboard)/directory/page.tsx')
ok(/How do they take permit applications\?/.test(dir) && /apply_method: editApply \|\| null/.test(dir) && /Applications:<\/span>/.test(dir),
  'the Directory card has the setting, saves it, and shows it')

const board = code('components/permits/permit-board.tsx')
const page = code('app/(dashboard)/projects/[id]/permits/page.tsx')
ok(/<ContactPicker filterType="inspector" value=\{authority\}/.test(board)
  && (page.match(/<ContactPicker filterType="inspector" value=\{issuingAuthority\}/g) ?? []).length === 2,
  'who issues it is picked from the Directory - in Update several houses and both Add Permit forms')

// "i should be able to select multiple and have an option to apply Issuing
// authority to all the same or some yes and some not"
ok(/const \[addTypes, setAddTypes\] = useState<string\[\]>\(\[\]\)/.test(board) && /<MultiSelect options=\{typeOptions\} value=\{addTypes\}/.test(board),
  'Add a permit takes several types at once - a dropdown with checkboxes ("looks stupid - i want a normal dropdown with checkboxes")')
ok(/\[\[true, 'Same for all'\], \[false, 'Different per type'\]\]/.test(board)
  && /const authorityOf = \(t: string\) => \(sameAuthority \? authority : authorityFor\[t\] \?\? authority\)\.trim\(\)/.test(board),
  '...with one issuing authority for all, or one per type')
ok(/for \(const t of addTypes\)/.test(board) && /action: 'add', permit_type: t, project_ids: ids, issuing_authority: authorityOf\(t\)/.test(board),
  '...sent as the same one-type request per type, so every house goes through the single-permit write')
ok(/One type that did not come back must not hide the others/.test(read('components/permits/permit-board.tsx')),
  '...and one type failing still reports the rest')
// "i cant change the type" - Could not save changes. Every line above read and
// wrote companies.extra, and the column had never been created: the edit
// failed, the create silently dropped the fields, and Email it's lookup
// errored. A type that describes no table is checked by nothing - so this
// asserts the column exists in the migrations, not just in the code.
ok(/ALTER TABLE public\.companies ADD COLUMN IF NOT EXISTS extra jsonb/.test(read('supabase/migrations/163_companies_extra.sql'))
  && /ALTER TABLE public\.companies ADD COLUMN IF NOT EXISTS extra jsonb/.test(read(`supabase/migrations/${combinedName()}`)),
  'companies.extra exists - in its migration and in the combined file')
// "inspector card is UGLY and weird / the edit opens this HUGE list / i cant
// scroll to save / why is there trade there if its an inspector"
{
  const dir2 = code('app/(dashboard)/directory/page.tsx')
  ok(/relative flex max-h-full w-full max-w-md flex-col overflow-hidden rounded-2xl/.test(dir2)
    && /<form onSubmit=\{saveEditCompany\} className="flex min-h-0 flex-1 flex-col">/.test(dir2)
    && /min-h-0 flex-1 space-y-4 overflow-y-auto px-6 py-5/.test(dir2),
    'the edit form scrolls in the middle and keeps Save on screen')
  ok(/\{editType !== 'inspector' && \(\s*<div className="space-y-1\.5">\s*<label className="text-xs font-medium text-muted-fg">Trade<\/label>/.test(dir2),
    'a township or inspector is not asked for a trade')
  ok(/\{profileData\?\.company\?\.type !== 'inspector' && \(\s*<div className="flex border-b border-line-soft shrink-0/.test(dir2)
    && /Permit applications<\/p>/.test(dir2) && /Inspections they do<\/p>/.test(dir2),
    'a township\'s card shows how it takes applications and what it inspects - not contract, payment and invoice tabs of zeroes')
  const chips = code('components/inspections/type-chips.tsx')
  ok(/<MultiSelect options=\{all\} value=\{picked\}/.test(chips) && !/rounded-full border px-3/.test(chips),
    'inspection types are a dropdown with checkboxes, not a wall of pills')
}
done()
