import { GUIDE_AUTHOR } from '@/lib/guides/author'

// The byline, printed where a reader sees it rather than only in the markup.
//
// Both lines come from lib/guides/author.ts, which is also what the Person node
// in the Article JSON-LD is built from - so the page and the structured data
// cannot end up naming different authors.
export function GuideByline() {
  return (
    <div className="mt-6 border-t border-line-soft pt-5">
      <p className="text-sm font-semibold text-ink">{GUIDE_AUTHOR.byline}</p>
      <p className="mt-1 text-sm text-muted-fg leading-relaxed">{GUIDE_AUTHOR.bio}</p>
    </div>
  )
}
