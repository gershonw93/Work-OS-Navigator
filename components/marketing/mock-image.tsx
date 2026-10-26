import { getImageProps } from 'next/image'
import { cn } from '@/lib/utils'
import { MOCK_IMAGES, type MockName } from './mock-images'

// A picture of the app, served as an IMAGE rather than as live HTML.
//
// Every product mock on the website used to be a React component, which is a
// nice demo and terrible text: a fetch of the homepage returned the sidebar,
// nine invented projects and twenty-four line items of an electrical quote as
// body copy, ahead of and around the real sentences. aria-hidden and
// data-nosnippet do not remove text from a fetch. A picture with alt text says
// what the screen shows in one sentence and nothing else.
//
// The pictures are rendered FROM the components (`*Screen`), so the drawing
// still has one home: change a mock, then run `node scripts/render-mocks.mjs`
// against `next dev` and commit the new images and mock-images.ts.
//
// Two widths (a phone render and a desktop one, chosen by <picture>, so only
// one is downloaded) and two themes (swapped by the `.dark` class the site
// already uses). Only the light one carries the alt text - the other is a
// duplicate and must not be read twice.
export function MockImage({
  name, alt, fill = false, priority = false, className,
}: {
  name: MockName
  alt: string
  /** Fill the parent box and crop from the top-left (the hero's monitor). */
  fill?: boolean
  priority?: boolean
  className?: string
}) {
  const m = MOCK_IMAGES[name]
  const sizes = fill ? '(min-width: 768px) 90vw, 100vw' : '(min-width: 1024px) 600px, 100vw'
  const imgClass = fill ? 'h-full w-full object-cover object-left-top' : 'h-auto w-full'

  const variant = (theme: 'light' | 'dark') => {
    const common = { sizes, alt: theme === 'light' ? alt : '', quality: 90 }
    const desk = getImageProps({
      ...common, src: `/marketing/mocks/${name}-desktop-${theme}.webp`,
      width: m.desktop.w, height: m.desktop.h,
    }).props
    const { props: phone } = getImageProps({
      ...common, src: `/marketing/mocks/${name}-mobile-${theme}.webp`,
      width: m.mobile.w, height: m.mobile.h,
      // Only the theme most visitors see is fetched early; the other is
      // display:none until the theme flips, and lazy keeps it from loading.
      ...(theme === 'light' && priority ? { priority: true } : { loading: 'lazy' as const }),
    })
    return (
      <picture className={cn(fill && 'h-full', theme === 'light' ? 'block dark:hidden' : 'hidden dark:block')}>
        <source media={`(min-width: ${m.breakpoint}px)`} srcSet={desk.srcSet} sizes={desk.sizes} />
        {/* eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text */}
        <img {...phone} aria-hidden={theme === 'dark' ? true : undefined} className={imgClass} />
      </picture>
    )
  }

  return (
    <div className={cn(fill && 'h-full', className)}>
      {variant('light')}
      {variant('dark')}
    </div>
  )
}
