import React from 'react';
import { cn } from '../../lib/utils';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  helperText?: string;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, label, error, helperText, type = 'text', id, ...props }, ref) => {
    const inputId = id || (label ? label.toLowerCase().replace(/\s+/g, '-') : undefined);

    return (
      <div className="w-full">
        {label && (
          <label
            htmlFor={inputId}
            className="block text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-executive-darkMuted mb-1.5"
          >
            {label}
          </label>
        )}
        <input
          type={type}
          id={inputId}
          ref={ref}
          className={cn(
            "w-full px-3.5 py-2 bg-white dark:bg-executive-darkBg border rounded-lg text-sm text-slate-900 dark:text-executive-darkText transition-colors placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-executive-emerald focus:border-transparent",
            error
              ? "border-red-500 focus:ring-red-500"
              : "border-slate-300 dark:border-executive-darkBorder hover:border-slate-400 dark:hover:border-slate-600",
            className
          )}
          {...props}
        />
        {error && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{error}</p>}
        {helperText && !error && (
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{helperText}</p>
        )}
      </div>
    );
  }
);

Input.displayName = 'Input';
