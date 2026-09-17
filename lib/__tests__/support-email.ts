// Where SyteNav tells a person to write, and why it is ONE fact.
//
// THE REPORT was three words on a screenshot of the Help page: "change all to
// info@sytenav.com". "All" was doing a lot of work - there were FOUR addresses
// hardcoded across FOURTEEN places, and one of them, shipped in front of
// customers on the in-app support card, was a personal Gmail account.
//
// Changing the address meant finding all fourteen. That is the shape this file
// exists to stop coming back.

import { ok, done, code, read, walk, exists } from './_helpers'
import { SUPPORT_EMAIL, supportMailto } from '../support-email'

console.log('\nsupport-email')

// ── one home ─────────────────────────────────────────────────────────────────
{
  ok(exists('lib/support-email.ts'), 'the address has a module of its own')
  ok(SUPPORT_EMAIL === 'info@sytenav.com', 'and it is the one that was asked for')
  ok(/^[^@\s]+@sytenav\.com$/.test(SUPPORT_EMAIL),
    'on our own domain - the one that shipped was a personal Gmail account')
}

// ── nothing else spells an address out ───────────────────────────────────────
{
  // Every source file, not only the ones somebody remembered. The Gmail
  // address lived on the in-app Help page while the marketing pages carried
  // three different @sytenav addresses between them, so a scan of either half
  // alone reports clean.
  // `walk` takes ONE directory and already filters to .ts/.tsx - read its
  // signature rather than writing the one you would have designed.
  const files = [...walk('app'), ...walk('components'), ...walk('lib')]
  const offenders: string[] = []
  for (const f of files) {
    if (f.endsWith('lib/support-email.ts')) continue
    if (f.includes('__tests__')) continue
    const src = read(f)
    // A literal address on OUR domain, or any gmail address, written into a
    // page. Somebody else's address off a database row is not this.
    const found = src.match(/[a-z0-9._%+-]+@(sytenav\.com|gmail\.com)/gi) ?? []
    for (const a of found) {
      // The envelope sender is not somewhere to write, and the seeded demo
      // data is not a contact point.
      if (/^noreply@sytenav\.com$/i.test(a) && f.endsWith('lib/email.ts')) continue
      if (f.endsWith('lib/seed-demo.ts')) continue
      offenders.push(`${f}: ${a}`)
    }
  }
  ok(offenders.length === 0,
    `no page spells a SyteNav address out for itself${offenders.length ? ' - ' + offenders.join(', ') : ''}`)
}

// ── and every place that used to has been pointed at it ─────────────────────
{
  // A scan for what is ABSENT passes trivially if the contact points were
  // deleted rather than repointed. These are the fourteen, by their homes.
  const surfaces = [
    'app/(dashboard)/help/page.tsx',
    'app/(marketing)/contact/page.tsx',
    'app/(marketing)/security/page.tsx',
    'app/(marketing)/acceptable-use/page.tsx',
    'app/(marketing)/cookies/page.tsx',
    'app/(marketing)/privacy/page.tsx',
    'app/(marketing)/terms/page.tsx',
    'components/marketing/contact-form.tsx',
    'components/marketing/legal-doc.tsx',
  ]
  for (const f of surfaces) {
    // Named by the last TWO segments: seven of these are `page.tsx`, and a
    // scan whose failures all read the same is a scan nobody can act on.
    ok(/SUPPORT_EMAIL/.test(code(f)), `${f.split('/').slice(-2).join('/')} reads the shared address`)
  }

  // The one Google prints. It sat in the Organization JSON-LD, which nobody
  // looking at a page would ever notice was stale.
  const marketing = code('app/(marketing)/layout.tsx')
  ok(/email: SUPPORT_EMAIL/.test(marketing),
    'and so does the Organization JSON-LD, which is the copy a search engine prints')
}

// ── a reply and a fresh mail are the same conversation ──────────────────────
{
  const email = code('lib/email.ts')
  ok(/replyTo: .*\|\| SUPPORT_EMAIL/.test(email),
    'a reply to any SyteNav email lands in the SAME inbox as every "email us"')
  // The envelope sender stays noreply@: it is not somewhere to write, and the
  // reply-to is what carries an answer back.
  ok(/'noreply@sytenav\.com'/.test(email),
    '...while the FROM stays noreply@, which is not an address to write to')
}

// ── the subject is not decoration ───────────────────────────────────────────
{
  const link = supportMailto('SyteNav support')
  ok(link.startsWith(`mailto:${SUPPORT_EMAIL}?`), 'the builder addresses the one inbox')
  ok(/subject=SyteNav%20support/.test(link), '...and fills the subject in')
  ok(!/body=/.test(link), '...with no empty body parameter when there is no body')
  ok(/body=hello/.test(supportMailto('s', 'hello')), 'and carries one when there is')

  // Four addresses became one, so the subject is the only thing separating a
  // security report from a cookie question in that inbox.
  const contact = code('components/marketing/contact-form.tsx')
  ok(/supportMailto\(subject, body\)/.test(contact),
    'the contact form still sends its own subject rather than an unlabelled mail')
}

done()
