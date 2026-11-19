// Where the native apps are. ONE home, so the footer (and anything later that
// says "get the app") cannot link two different listings.
//
// Android is the `appId` in capacitor.config.ts on Google Play. iOS went live
// on 2026-11-19 (1.0 build 15, approved after three rounds of 3.1.1). Typed
// `string | null` on purpose: null is still the switch that greys the badge out
// as "Coming soon" with no link, should a listing ever be pulled - a store
// badge that opens a 404 is a button lying about where it goes.
export const PLAY_STORE_URL = 'https://play.google.com/store/apps/details?id=com.sytenav.app'
export const APP_STORE_URL: string | null = 'https://apps.apple.com/us/app/sytenav/id6808712636'
