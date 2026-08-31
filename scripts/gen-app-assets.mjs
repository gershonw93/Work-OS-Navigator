import sharp from 'sharp'
import { writeFileSync } from 'node:fs'

// The SyteNav "Field" mark - a locator arrow knocked out of a tile.
// Same path as components/ui/logo.tsx, so the phone icon and the app agree.
const INK = '#0F1113'
const ACCENT = '#C9F24A'
const PAPER = '#f3f4ef'
const ARROW = 'M14 13 L37 22 L26 26 L22 37 Z'

// THE APP ICON HAS NO ROUNDED CORNERS AND NO TRANSPARENCY.
// iOS applies its own mask; supplying one that is already rounded gets the
// corners rounded twice, and an icon with an alpha channel is rejected
// outright. So: a full-bleed square.
// The arrow's bounding box in the 48-unit grid is x 14-37, y 13-37, so its
// centre is (25.5, 25) and not (24, 24) - drawn as-is it sits low and left.
// This recentres it and sizes it up: inside the app the mark is a small tile
// in a sidebar, but a home-screen icon is looked at on its own and a glyph
// filling half the square reads as timid.
const CENTRE = 'translate(24 24) scale(1.3) translate(-25.5 -25)'

const icon = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 48 48">
  <rect width="48" height="48" fill="${INK}"/>
  <g transform="${CENTRE}"><path d="${ARROW}" fill="${ACCENT}"/></g>
</svg>`

// The splash is what fills the screen while the app connects. The mark sits
// on the same paper the app itself opens on, so the launch does not flash a
// different colour than the first screen.
const splash = (bg, tile, mark) => `<svg xmlns="http://www.w3.org/2000/svg" width="2732" height="2732" viewBox="0 0 2732 2732">
  <rect width="2732" height="2732" fill="${bg}"/>
  <g transform="translate(1166 1166) scale(8)">
    <rect width="48" height="48" rx="12" fill="${tile}"/>
    <g transform="${CENTRE}"><path d="${ARROW}" fill="${mark}"/></g>
  </g>
</svg>`

const png = async (svg, out) => {
  await sharp(Buffer.from(svg)).png().flatten({ background: '#000000' }).toFile(out)
  console.log('wrote', out)
}

await png(icon, 'resources/icon.png')
await sharp(Buffer.from(splash(PAPER, INK, ACCENT))).png().toFile('resources/splash.png')
console.log('wrote resources/splash.png')
await sharp(Buffer.from(splash(INK, PAPER, ACCENT))).png().toFile('resources/splash-dark.png')
console.log('wrote resources/splash-dark.png')
