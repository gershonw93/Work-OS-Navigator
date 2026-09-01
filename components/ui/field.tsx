import { cn } from '@/lib/utils'
import { Label } from '@/components/ui/label'
import type { ReactNode } from 'react'

/**
 * A labelled field that can say what is wrong with it.
 *
 * THE COMPLAINT THIS ANSWERS: "no validation messages anywhere - signup,
 * customer, project. Fields just fail quietly." They failed quietly because
 * there was nowhere for a message to go. A form would set one error string for
 * the whole form, or none at all, and the field that caused it looked exactly
 * like the fields that did not.
 *
 * Deliberately small. 251 inputs across 36 forms cannot be made consistent by
 * asking every form to remember to render a red paragraph in the same place -
 * the only thing that works is one component that already does.
 *
 * `hint` and `error` occupy the same line: a field showing both is a field
 * telling you two things at once, and the error is the one that matters.
 */
export function Field({
  label, htmlFor, error, hint, required, className, children,
}: {
  label?: string
  htmlFor?: string
  /** The message. Absent or empty means the field is fine. */
  error?: string | null
  /** Standing guidance, shown only while there is no error. */
  hint?: ReactNode
  required?: boolean
  className?: string
  children: ReactNode
}) {
  return (
    <div className={cn('space-y-1.5', className)}>
      {label && (
        <Label htmlFor={htmlFor}>
          {label}
          {required && <span className="ml-0.5 text-danger" aria-hidden>*</span>}
        </Label>
      )}
      {children}
      {error
        ? <p className="text-xs text-danger" role="alert">{error}</p>
        : hint
          ? <p className="text-xs text-faint">{hint}</p>
          : null}
    </div>
  )
}
