'use client'

import { useEffect, useRef, useState } from 'react'

// Counts from 0 to `end` the first time it scrolls into view.
// Skips the animation entirely under prefers-reduced-motion.
export function CountUp({
  end,
  prefix = '',
  suffix = '',
  decimals = 0,
  duration = 1600,
  className,
}: {
  end: number
  prefix?: string
  suffix?: string
  decimals?: number
  duration?: number
  className?: string
}) {
  const ref = useRef<HTMLSpanElement>(null)
  const [value, setValue] = useState(0)
  const started = useRef(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setValue(end)
      return
    }
    const io = new IntersectionObserver(
      entries => {
        if (!entries[0]?.isIntersecting || started.current) return
        started.current = true
        io.disconnect()
        const t0 = performance.now()
        const tick = (t: number) => {
          const p = Math.min((t - t0) / duration, 1)
          const eased = 1 - Math.pow(1 - p, 3)
          setValue(end * eased)
          if (p < 1) requestAnimationFrame(tick)
        }
        requestAnimationFrame(tick)
      },
      { threshold: 0.4 }
    )
    io.observe(el)
    return () => io.disconnect()
  }, [end, duration])

  const shown = value.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })

  return (
    <span ref={ref} className={className}>
      {prefix}
      {shown}
      {suffix}
    </span>
  )
}
