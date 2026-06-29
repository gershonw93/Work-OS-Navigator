'use client'

import { SelectHTMLAttributes, forwardRef } from 'react'
import { SearchableSelect } from './searchable-select'

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {}

/**
 * Backwards-compatible wrapper: keeps the <Select><option/></Select> API but
 * renders a searchable, alphabetically-sorted combobox under the hood.
 */
export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, children, value, defaultValue, onChange, disabled, required, name, id }, _ref) => {
    return (
      <SearchableSelect
        className={className}
        value={value as string | undefined}
        defaultValue={defaultValue as string | undefined}
        onChange={onChange as any}
        disabled={disabled}
        required={required}
        name={name}
        id={id}
      >
        {children}
      </SearchableSelect>
    )
  }
)

Select.displayName = 'Select'
