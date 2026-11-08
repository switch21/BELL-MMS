import React from 'react';
import { cn } from '../../lib/utils';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  isLoading?: boolean;
}

export const Button: React.FC<ButtonProps> = ({
  className,
  variant = 'primary',
  size = 'md',
  isLoading = false,
  children,
  disabled,
  ...props
}) => {
  const baseStyles = "inline-flex items-center justify-center font-medium rounded-lg transition-all focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed select-none";

  const variants = {
    // Émeraude #27815E -> vert profond au hover
    primary: "bg-executive-emerald hover:bg-executive-dark text-white shadow-sm focus:ring-executive-emerald",
    // Vert doux #B5C9B8
    secondary: "bg-executive-soft/20 text-executive-dark dark:text-executive-soft hover:bg-executive-soft/30 focus:ring-executive-soft",
    // Contour net
    outline: "border border-slate-300 dark:border-executive-darkBorder text-slate-700 dark:text-executive-darkText hover:bg-slate-100 dark:hover:bg-executive-darkSurface focus:ring-executive-emerald",
    // Fantôme
    ghost: "text-slate-600 dark:text-executive-darkMuted hover:bg-slate-100 dark:hover:bg-executive-darkSurface hover:text-slate-900 dark:hover:text-white",
    // Danger / Alerte
    danger: "bg-red-600 hover:bg-red-700 text-white shadow-sm focus:ring-red-500",
  };

  const sizes = {
    sm: "px-3 py-1.5 text-xs gap-1.5",
    md: "px-4 py-2 text-sm gap-2",
    lg: "px-5 py-2.5 text-base gap-2.5",
  };

  return (
    <button
      className={cn(baseStyles, variants[variant], sizes[size], className)}
      disabled={disabled || isLoading}
      {...props}
    >
      {isLoading && (
        <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-current" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
      )}
      {children}
    </button>
  );
};
