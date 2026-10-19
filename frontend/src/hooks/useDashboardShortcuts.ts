'use client';

import { useEffect } from 'react';

interface DashboardShortcutOptions {
  onHelp: () => void;
  onCloseHelp: () => void;
}

export function useDashboardShortcuts({ onHelp, onCloseHelp }: DashboardShortcutOptions): void {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.altKey || event.ctrlKey || event.metaKey || event.repeat) return;

      const target = event.target;
      if (
        target instanceof HTMLElement &&
        (target.isContentEditable || target.closest('input, textarea, select, [contenteditable="true"], [role="textbox"]'))
      ) {
        return;
      }

      if (event.key === '/' && !event.shiftKey) {
        event.preventDefault();
        document.getElementById('market-search')?.focus();
      } else if (event.key.toLowerCase() === 'f' && !event.shiftKey) {
        event.preventDefault();
        document.getElementById('market-status-filter')?.querySelector<HTMLElement>('[role="tab"]')?.focus();
      } else if (event.key === '?') {
        event.preventDefault();
        onHelp();
      } else if (event.key === 'Escape') {
        onCloseHelp();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onCloseHelp, onHelp]);
}