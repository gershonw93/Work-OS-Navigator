import { ImageResponse } from 'next/og'

export const runtime = 'edge'
export const alt = 'SyteNav — construction project management built for the field'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          background: '#0F1113',
          padding: '80px',
          fontFamily: 'sans-serif',
        }}
      >
        {/* Logo lockup */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 28 }}>
          <svg width="104" height="104" viewBox="0 0 48 48">
            <rect width="48" height="48" rx="12" fill="#1F2227" />
            <path d="M14 13 L37 22 L26 26 L22 37 Z" fill="#C9F24A" />
          </svg>
          <div style={{ display: 'flex', fontSize: 88, fontWeight: 800, letterSpacing: -2 }}>
            <span style={{ color: '#ECEEF0' }}>SYTE</span>
            <span style={{ color: '#C9F24A' }}>NAV</span>
          </div>
        </div>

        {/* Tagline */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div style={{ fontSize: 60, fontWeight: 700, color: '#ECEEF0', lineHeight: 1.05, maxWidth: 1000 }}>
            Construction project management, built for the field.
          </div>
          <div style={{ fontSize: 30, color: '#9AA0A8', maxWidth: 960 }}>
            Permits, daily logs, RFIs, invoices, and compliance — in one place.
          </div>
        </div>

        {/* Accent bar */}
        <div style={{ display: 'flex', height: 10, width: '100%', background: '#C9F24A', borderRadius: 6 }} />
      </div>
    ),
    { ...size }
  )
}
