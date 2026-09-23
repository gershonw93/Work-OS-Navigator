// Google will not verify an app that reads Contacts unless its privacy policy
// has a Google user data section with the Limited Use sentence in Google's own
// words. Losing it in an edit would fail the next verification review - or get
// the app's access suspended - with nothing in the code looking wrong.

import { GOOGLE_SCOPES } from '../google-contacts'
import { ok, done, read } from './_helpers'

const policy = read('app/(marketing)/privacy/page.tsx')
ok(/h: 'Google user data'/.test(policy), 'the privacy policy has a Google user data section')
ok(/will adhere to the Google API Services User Data Policy/.test(policy) && /Limited Use requirements/.test(policy),
  '...with the Limited Use disclosure, worded as Google requires')
ok(/read-only access/.test(policy) && GOOGLE_SCOPES.split(' ').every(s => /readonly|userinfo\.email/.test(s)),
  'the policy says read-only, and the scopes really are read-only')
ok(/myaccount\.google\.com\/permissions/.test(policy), 'it says how to remove access from the Google side')
done()
