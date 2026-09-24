// Google Play refused the release: "All developers requesting access to the
// photo and video permissions are required to tell Google Play about the core
// functionality of their app." READ_MEDIA_IMAGES is only for apps whose core
// purpose is the photo library; everything else must use the system picker.
// SyteNav already does - every upload is an <input type="file">, which needs
// no permission - so the permission is REMOVED, including from anything a
// plugin's manifest would merge in.

import { ok, done, read } from './_helpers'

const m = read('android/app/src/main/AndroidManifest.xml')
ok(/xmlns:tools="http:\/\/schemas\.android\.com\/tools"/.test(m), 'the manifest declares the tools namespace')
for (const p of ['READ_MEDIA_IMAGES', 'READ_MEDIA_VIDEO', 'READ_EXTERNAL_STORAGE']) {
  const line = m.match(new RegExp(`<uses-permission[^>]*android\\.permission\\.${p}"[^>]*>`))?.[0] ?? ''
  ok(/tools:node="remove"/.test(line), `${p} is removed, not requested`)
}
ok(/com\.google\.android\.gms\.permission\.AD_ID" tools:node="remove"/.test(m),
  'the advertising ID is removed - Play was told No, and a merged library must not make that false')
ok(/android\.permission\.CAMERA"/.test(m), 'the camera permission is still there - taking a photo is not reading the library')

done()
