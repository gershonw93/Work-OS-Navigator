import { ReactNode } from 'react'
import { cn } from '@/lib/utils'

// A browser-window chrome frame so product mockups read as a screenshot on a PC.
export function BrowserMock({ url = 'app.sytenav.com', children, className }: { url?: string; children: ReactNode; className?: string }) {
  return (
    <div className={cn('rounded-xl border border-line bg-panel shadow-2xl overflow-hidden', className)}>
      <div className="flex items-center gap-2 px-3 py-2 border-b border-line-soft bg-surface">
        <span className="h-3 w-3 rounded-full bg-danger-solid/70" />
        <span className="h-3 w-3 rounded-full bg-warn/70" />
        <span className="h-3 w-3 rounded-full bg-success-solid/70" />
        <div className="ml-3 flex-1 max-w-md mx-auto rounded-md bg-panel border border-line px-3 py-1 text-[11px] text-faint text-center truncate">{url}</div>
      </div>
      <div className="bg-surface">{children}</div>
    </div>
  )
}
