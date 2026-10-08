// Where the native apps are. ONE home, so the footer (and anything later that
// says "get the app") cannot link two different listings.
//
// Android is the `appId` in capacitor.config.ts on Google Play. iOS has no
// listing yet, so it is null and the footer shows it greyed out as "Coming
// soon" with no link - a store badge that opens a 404 is a button lying about
// where it goes. When the App Store listing exists, put its URL here and the
// badge turns on by itself.
export const PLAY_STORE_URL = 'https://play.google.com/store/apps/details?id=com.sytenav.app'
export const APP_STORE_URL: string | null = null
