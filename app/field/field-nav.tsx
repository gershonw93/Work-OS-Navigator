'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Home, CheckSquare, Camera, User } from 'lucide-react'
import { cn } from '@/lib/utils'

const TABS = [
  { href: '/field', label: 'Home', icon: Home, exact: true },
  { href: '/field/tasks', label: 'Tasks', icon: CheckSquare },
  { href: '/field/log', label: 'Log', icon: Camera },
  { href: '/field/me', label: 'Me', icon: User },
]

export function FieldNav() {
  const pathname = usePathname()
  return (
    <nav className="fixed bottom-0 inset-x-0 z-40 border-t border-line bg-panel/95 backdrop-blur supports-[backdrop-filter]:bg-panel/80">
      <div className="mx-auto flex max-w-lg">
        {TABS.map(t => {
          const active = t.exact ? pathname === t.href : pathname.startsWith(t.href)
          const Icon = t.icon
          return (
            <Link
              key={t.href}
              href={t.href}
              className={cn(
                'flex flex-1 flex-col items-center gap-1 py-3 text-xs font-medium transition-colors',
                active ? 'text-accent' : 'text-muted-fg',
              )}
            >
              <Icon className={cn('h-6 w-6', active && 'stroke-[2.5]')} />
              {t.label}
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
