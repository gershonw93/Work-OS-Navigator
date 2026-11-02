'use client'

import { useEffect, useState } from 'react'

/**
 * Whether the screen is at least `px` wide, kept current as it changes.
 *
 * For a component whose SHAPE differs by width in a way classes cannot say -
 * the permit panel is a docked column beside the list on a desktop and a
 * full-screen overlay (with `data-overlay`, which freezes the page) on a
 * phone, and an attribute cannot be switched by a media query. False until
 * mounted: the server cannot know the width, and every caller here renders
 * only after a click.
 */
export function useMinWidth(px: number): boolean {
  const [wide, setWide] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia(`(min-width: ${px}px)`)
    const read = () => setWide(mq.matches)
    read()
    mq.addEventListener('change', read)
    return () => mq.removeEventListener('change', read)
  }, [px])
  return wide
}
