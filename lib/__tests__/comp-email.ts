// GIVING A COMPANY FREE ACCESS TELLS ITS ADMINS.
//
// Asked: "giving free access sends an email?" - it did not, and the answer was
// "yes add the email". The comp's reason is the sentence their Billing card
// prints, so the letter carries the same words; it goes to the company's admins
// (the people who see Billing), ONCE when the company becomes free, and what
// went out is reported to the console rather than assumed.

import { ok, done, code } from './_helpers'
import { compEmail } from '../email'
import { DEMO_EMAILS } from '../demo-emails'

function main() {
  const m = compEmail({ name: 'Dana Whitfield', companyName: 'Brightline Construction', reason: 'Free for founding partners, with our thanks.', appUrl: 'https://app.sytenav.com' })
  ok(m.subject === 'SyteNav is now free for Brightline Construction', 'the subject says what happened, to whom')
  ok(m.text.includes('Free for founding partners, with our thanks.') && m.html.includes('Free for founding partners, with our thanks.'), 'the reason - the Billing card sentence - is in both halves')
  ok(m.text.startsWith('Hi Dana,'), 'it greets the admin by first name')
  ok(!/\$\d|plan|trial/i.test(m.text), 'no price, no plan, no trial - nothing to buy and nothing ending')
  ok(DEMO_EMAILS.some(d => d.key === 'comp'), 'the demo board can preview it')

  const route = code('app/api/admin/billing/route.ts')
  const comp = route.slice(route.indexOf("action === 'comp'"), route.indexOf("action === 'uncomp'"))
  ok(/eq\('role', 'admin'\)/.test(comp), 'it goes to the company\'s admins')
  ok(/if \(wasComped\) return/.test(comp) && comp.indexOf('wasComped) return') < comp.indexOf('sendEmail('), 'a company already comped is not mailed again')
  ok(comp.indexOf("from('company_billing').upsert") < comp.indexOf('sendEmail('), 'the comp is written before any mail - a failed send never undoes it')
  ok(/emailed: sent/.test(comp) && /did not send/.test(comp), 'what went out is reported, including a failure')
  ok(/out\?\.note \?\? done/.test(code('app/admin/billing/page.tsx')), 'the console shows the route\'s own account of who was emailed')

  done()
}

main()
