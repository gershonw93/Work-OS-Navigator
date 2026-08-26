import { ImageResponse } from 'next/og'

export const runtime = 'edge'

/**
 * The SyteNav mark, as a PNG, for email.
 *
 * Email cannot use the real logo. It is an inline SVG in
 * components/ui/logo.tsx, and Gmail and Outlook both strip <svg> outright, so
 * the email header was approximating the arrow with a Unicode triangle
 * (&#9656;) inside a rounded table cell. Two things were wrong with that: the
 * glyph renders at a different size and baseline in every font a client might
 * fall back to - some substitute a different shape, some show a box - and
 * Outlook ignores border-radius, so the rounded tile came out square.
 *
 * A raster of the actual geometry fixes both. Generated rather than committed
 * as a file on purpose: there is no rasterizer in this repo's toolchain (no
 * sharp, no ImageMagick), so a checked-in binary could never be corrected
 * without adding one. This route can be edited like any other code.
 *
 * ONLY THE MARK, not the full lockup. The SYTE/NAV wordmark stays as HTML text
 * in the email, where it always renders - an image that fails to load should
 * cost you a small square, not the company name.
 *
 * Rendered at 3x and displayed at 30px so it stays sharp on a retina screen.
 */
const SIZE = 90

export async function GET() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          // Geometry copied from components/ui/logo.tsx so email, app and the
          // marketing site draw the same mark. The tile is --ink and the arrow
          // is --accent, as they are in light mode.
          background: '#16181B',
          borderRadius: 22,
        }}
      >
        <svg width={SIZE} height={SIZE} viewBox="0 0 48 48">
          <path d="M14 13 L37 22 L26 26 L22 37 Z" fill="#C9F24A" />
        </svg>
      </div>
    ),
    // No Cache-Control here on purpose. ImageResponse already sends
    // `public, immutable, no-transform, max-age=31536000`, which is exactly
    // right - Gmail fetches through its own proxy and caches the result, and a
    // stale logo is not a failure mode worth paying to avoid. Setting it again
    // only produced a duplicated header.
    { width: SIZE, height: SIZE },
  )
}
