// v1 ships iPhone-only. The target was universal ("1,2"), which makes Apple
// demand 13" iPad screenshots - and there is no iPad to take them on. Chosen
// BEFORE the first store release on purpose: an update may ADD iPad support,
// but Apple refuses one that REMOVES it once a version has shipped with it. So
// going universal later is a deliberate new build, and this pin is what says
// the current state is a decision rather than an accident.

import { ok, done, read } from './_helpers'

const pbx = read('ios/App/App.xcodeproj/project.pbxproj')
const families = pbx.match(/TARGETED_DEVICE_FAMILY = [^;]+;/g) ?? []
ok(families.length >= 2, `both build configurations set a device family (found ${families.length})`)
ok(families.every(f => f === 'TARGETED_DEVICE_FAMILY = 1;'),
  `every configuration is iPhone-only (found: ${Array.from(new Set(families)).join(', ')})`)
ok(!/13" iPad/.test(read('store/listing.md').replace(/no iPad set/, '')),
  'the listing notes no longer ask for iPad screenshots')

done()
