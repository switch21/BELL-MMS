import React, { useEffect } from 'react';
import { X } from 'lucide-react';
import { cn } from '../../lib/utils';
import { Button } from './Button';

export interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  maxWidth?: 'sm' | 'md' | 'lg' | 'xl' | '2xl';
}

export const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  title,
  description,
  children,
  footer,
  maxWidth = 'md',
}) => {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    if (isOpen) {
      document.body.style.overflow = 'hidden';
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      document.body.style.overflow = 'unset';
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const maxWidths = {
    sm: 'max-w-sm',
    md: 'max-w-md',
    lg: 'max-w-lg',
    xl: 'max-w-xl',
    '2xl': 'max-w-2xl',
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 overflow-y-auto">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs transition-opacity"
        onClick={onClose}
      />

      {/* Modal Dialog */}
      <div
        className={cn(
          "relative w-full bg-white dark:bg-executive-darkSurface border border-slate-200 dark:border-executive-darkBorder rounded-xl shadow-2xl z-10 overflow-hidden transform transition-all my-8",
          maxWidths[maxWidth]
        )}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-executive-darkBorder bg-slate-50/50 dark:bg-executive-darkBg/50">
          <div>
            <h3 className="text-base font-semibold text-slate-900 dark:text-executive-darkText">
              {title}
            </h3>
            {description && (
              <p className="text-xs text-slate-500 dark:text-executive-darkMuted mt-0.5">
                {description}
              </p>
            )}
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={onClose}
            className="p-1 h-8 w-8 rounded-full"
            aria-label="Fermer"
          >
            <X className="w-4 h-4" />
          </Button>
        </div>

        <div className="p-6 max-h-[75vh] overflow-y-auto">
          {children}
        </div>

        {footer && (
          <div className="px-6 py-3.5 bg-slate-50 dark:bg-executive-darkBg border-t border-slate-100 dark:border-executive-darkBorder flex items-center justify-end gap-2.5">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
};
