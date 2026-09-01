import { cn } from '@/lib/utils'
import { InputHTMLAttributes, forwardRef } from 'react'

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  /**
   * Something is wrong with what is in this field.
   *
   * A boolean, not the message - the message belongs under the field, which is
   * what <Field> is for. This only has to make the field LOOK wrong, and tell
   * a screen reader it is, which `aria-invalid` does and a red border alone
   * does not.
   */
  error?: boolean
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, error, ...props }, ref) => {
    return (
      <input
        type={type}
        aria-invalid={error || undefined}
        className={cn(
          'flex h-9 w-full rounded-md border bg-panel px-3 py-1 text-sm text-ink',
          'placeholder:text-faint',
          'focus:outline-none focus:ring-2 focus:ring-offset-0',
          'disabled:cursor-not-allowed disabled:opacity-50',
          'transition-colors',
          error
            ? 'border-danger focus:ring-danger focus:border-danger'
            : 'border-muted2 focus:ring-accent focus:border-accent',
          className
        )}
        ref={ref}
        {...props}
      />
    )
  }
)

Input.displayName = 'Input'
