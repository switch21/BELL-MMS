import React from 'react';
import { cn } from '../../lib/utils';

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  hoverable?: boolean;
}

export const Card: React.FC<CardProps> = ({
  className,
  hoverable = false,
  children,
  ...props
}) => {
  return (
    <div
      className={cn(
        "bg-white dark:bg-executive-darkSurface border border-slate-200 dark:border-executive-darkBorder rounded-xl shadow-sm transition-all",
        hoverable && "hover:shadow-md hover:border-executive-emerald/40 cursor-pointer",
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
};

export const CardHeader: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({
  className,
  children,
  ...props
}) => {
  return (
    <div
      className={cn("px-6 py-4 border-b border-slate-100 dark:border-executive-darkBorder flex items-center justify-between", className)}
      {...props}
    >
      {children}
    </div>
  );
};

export const CardTitle: React.FC<React.HTMLAttributes<HTMLHeadingElement>> = ({
  className,
  children,
  ...props
}) => {
  return (
    <h3
      className={cn("text-base font-semibold text-slate-900 dark:text-executive-darkText flex items-center gap-2", className)}
      {...props}
    >
      {children}
    </h3>
  );
};

export const CardContent: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({
  className,
  children,
  ...props
}) => {
  return (
    <div className={cn("p-6", className)} {...props}>
      {children}
    </div>
  );
};
