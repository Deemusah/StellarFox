'use client';

import type { ReactNode } from 'react';

interface ConfirmationDialogProps {
  title: string;
  children: ReactNode;
  confirmLabel: string;
  busyLabel: string;
  busy: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmationDialog({
  title,
  children,
  confirmLabel,
  busyLabel,
  busy,
  onConfirm,
  onCancel,
}: Readonly<ConfirmationDialogProps>): JSX.Element {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <section role="dialog" aria-modal="true" aria-labelledby="confirmation-title" className="w-full max-w-md overflow-hidden rounded-lg border border-gray-700 bg-gray-900 shadow-2xl">
        <div className="p-6">
          <h2 id="confirmation-title" className="mb-2 text-xl font-bold">{title}</h2>
          <div className="mb-6 text-gray-300">{children}</div>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={onCancel}
              disabled={busy}
              className="flex-1 rounded bg-gray-800 py-2.5 font-medium text-white transition-colors hover:bg-gray-700 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={onConfirm}
              disabled={busy}
              className="flex-1 rounded bg-blue-600 py-2.5 font-medium text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
            >
              {busy ? busyLabel : confirmLabel}
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}