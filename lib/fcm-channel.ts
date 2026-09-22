/**
 * The Android notification channel every SyteNav push is posted to.
 *
 * Its own file because BOTH ends read it: the server names it in every FCM
 * message (lib/fcm.ts) and the app creates it on start (lib/use-push.ts).
 * lib/fcm.ts imports node:crypto, which a client component cannot pull in,
 * so the shared constant cannot live there.
 *
 * Android 8+ files every notification under a channel, and one the app never
 * created lands in "Miscellaneous" at default importance - no heads-up banner,
 * which for "a bill needs your approval" reads as nothing arrived.
 */
export const ANDROID_CHANNEL_ID = 'sytenav'
