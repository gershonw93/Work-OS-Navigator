'use client'

import * as React from 'react'
import { Eye, EyeOff } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

// A password field with a show/hide toggle. Drop-in replacement for
// <Input type="password"> wherever a user types a password.
type PasswordInputProps = Omit<React.ComponentProps<typeof Input>, 'type'> & {
  /** Override the toggle button colors, e.g. on the dark auth cards. */
  toggleClassName?: string
}

const PasswordInput = React.forwardRef<HTMLInputElement, PasswordInputProps>(
  ({ className, toggleClassName, ...props }, ref) => {
    const [visible, setVisible] = React.useState(false)
    return (
      <div className="relative">
        <Input
          ref={ref}
          type={visible ? 'text' : 'password'}
          className={cn('pr-10', className)}
          {...props}
        />
        <button
          type="button"
          onClick={() => setVisible(v => !v)}
          aria-label={visible ? 'Hide password' : 'Show password'}
          title={visible ? 'Hide password' : 'Show password'}
          tabIndex={-1}
          className={cn(
            'absolute inset-y-0 right-0 flex items-center px-3 transition-colors',
            toggleClassName ?? 'text-muted-fg hover:text-ink'
          )}
        >
          {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>
    )
  }
)
PasswordInput.displayName = 'PasswordInput'

export { PasswordInput }
