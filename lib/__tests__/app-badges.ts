// The footer's "Get the app" badges. Two rules: the App Store badge links
// nowhere until there is a listing, and neither badge renders inside the
// native app (a Google Play badge in the iOS build is App Review 2.3.10).
import { ok, done, code } from './_helpers'
import { APP_STORE_URL, PLAY_STORE_URL } from '../app-stores'

const src = code('components/marketing/app-badges.tsx')
const footer = code('components/marketing/marketing-footer.tsx')

ok(/<AppBadges\s*\/>/.test(footer), 'the marketing footer renders the badges')
ok(/useNativePlatform\(\)/.test(src) && /if \(!ready \|\| isNative\) return null/.test(src),
  'hidden inside the native app, and until the platform is known')
ok(/^https:\/\/play\.google\.com\/store\/apps\/details\?id=com\.sytenav\.app$/.test(PLAY_STORE_URL),
  'Google Play points at the appId in capacitor.config.ts')
ok(code('capacitor.config.ts').includes("appId: 'com.sytenav.app'"), '...which is still that appId')

// The greyed-out branch carries no href: a "Coming soon" badge that opens a
// page is a control that leads somewhere other than where it says.
const greyed = src.slice(src.indexOf('APP_STORE_URL ? ('))
const off = greyed.slice(greyed.indexOf(') : ('))
ok(off.length > 5 && !/href=/.test(off.slice(0, off.indexOf('</span>\n        )}') + 1 || 600)) && /Coming soon/.test(off),
  'with no App Store listing the badge is greyed, says Coming soon, and links nowhere')
ok(APP_STORE_URL === null || /^https:\/\/apps\.apple\.com\//.test(APP_STORE_URL), 'an App Store URL, once set, is an apps.apple.com listing')

done()
