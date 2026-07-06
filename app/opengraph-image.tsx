import { ImageResponse } from 'next/og'

export const runtime = 'edge'
export const alt = 'SyteNav, construction management built for the field'
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
          backgroundImage:
            'linear-gradient(to right, rgba(236,238,240,0.055) 1px, transparent 1px), linear-gradient(to bottom, rgba(236,238,240,0.055) 1px, transparent 1px)',
          backgroundSize: '44px 44px',
          padding: '72px 80px',
          fontFamily: 'sans-serif',
        }}
      >
        {/* Logo lockup */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 26 }}>
          <svg width="92" height="92" viewBox="0 0 48 48">
            <rect width="48" height="48" rx="12" fill="#1F2227" />
            <path d="M14 13 L37 22 L26 26 L22 37 Z" fill="#C9F24A" />
          </svg>
          <div style={{ display: 'flex', fontSize: 76, fontWeight: 800, letterSpacing: -2 }}>
            <span style={{ color: '#ECEEF0' }}>SYTE</span>
            <span style={{ color: '#C9F24A' }}>NAV</span>
          </div>
        </div>

        {/* Headline */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
          <div style={{ fontSize: 72, fontWeight: 800, color: '#ECEEF0', lineHeight: 1.04, letterSpacing: -1.5, maxWidth: 1020 }}>
            Run the whole build from one place.
          </div>
          <div style={{ fontSize: 29, color: '#9AA0A8', maxWidth: 1000, lineHeight: 1.35 }}>
            AI quote scanning, budgets and escrow, scheduling, daily logs, invoices, and compliance, for GCs and subs.
          </div>
        </div>

        {/* Stats + accent bar */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 26 }}>
          <div style={{ display: 'flex', gap: 14, fontSize: 25, color: '#C9F24A', fontWeight: 700 }}>
            <span>140+ contractors</span>
            <span style={{ color: '#6E747C' }}>·</span>
            <span>$42M tracked</span>
            <span style={{ color: '#6E747C' }}>·</span>
            <span>1,800+ jobs</span>
          </div>
          <div style={{ display: 'flex', height: 10, width: '100%', background: '#C9F24A', borderRadius: 6 }} />
        </div>
      </div>
    ),
    { ...size }
  )
}
