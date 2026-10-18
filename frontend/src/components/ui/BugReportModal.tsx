'use client';

import { useState, useEffect, useRef, FormEvent } from 'react';
import { useBugReport, BugSeverity, BugCategory } from '../../hooks/useBugReport';

interface BugReportFormProps {
  /** When true, wraps the form in a modal overlay. When false, renders inline. */
  asModal?: boolean;
  onClose?: () => void;
  /** Optional Bearer token for authenticated submissions */
  token?: string;
}

const SEVERITIES: { value: BugSeverity; label: string; color: string }[] = [
  { value: 'low', label: 'Low', color: 'text-green-400' },
  { value: 'medium', label: 'Medium', color: 'text-yellow-400' },
  { value: 'high', label: 'High', color: 'text-orange-400' },
  { value: 'critical', label: 'Critical', color: 'text-red-400' },
];

const BUG_CATEGORIES: { value: BugCategory; label: string }[] = [
  { value: 'ui', label: 'UI / Display' },
  { value: 'transaction', label: 'Transaction' },
  { value: 'wallet', label: 'Wallet' },
  { value: 'market', label: 'Market' },
  { value: 'general', label: 'General' },
];

const FOCUSABLE = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

function BugReportFormContent({
  onClose,
  token,
}: {
  onClose?: () => void;
  token?: string;
}) {
  const { submit, isSubmitting, error, success, reset } = useBugReport();

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [severity, setSeverity] = useState<BugSeverity>('medium');
  const [category, setCategory] = useState<BugCategory>('general');
  const [steps, setSteps] = useState('');
  const [expected, setExpected] = useState('');
  const [actual, setActual] = useState('');
  const [showOptional, setShowOptional] = useState(false);

  const pageUrl =
    typeof window !== 'undefined' ? window.location.href : undefined;

  const getBrowserInfo = (): Record<string, unknown> => {
    if (typeof window === 'undefined') return {};
    return {
      userAgent: navigator.userAgent,
      platform: navigator.platform,
      language: navigator.language,
      screenWidth: window.screen.width,
      screenHeight: window.screen.height,
      windowWidth: window.innerWidth,
      windowHeight: window.innerHeight,
    };
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    await submit(
      {
        title,
        description,
        severity,
        category,
        stepsToReproduce: steps.trim() || undefined,
        expectedBehavior: expected.trim() || undefined,
        actualBehavior: actual.trim() || undefined,
        pageUrl,
        browserInfo: getBrowserInfo(),
      },
      token,
    );
  };

  const handleReset = () => {
    reset();
    setTitle('');
    setDescription('');
    setSeverity('medium');
    setCategory('general');
    setSteps('');
    setExpected('');
    setActual('');
    setShowOptional(false);
  };

  if (success) {
    return (
      <div className="flex flex-col items-center gap-4 py-6 text-center">
        <div className="text-5xl" aria-hidden="true">✅</div>
        <h3 className="text-lg font-semibold text-white">Bug report submitted!</h3>
        <p className="text-gray-400 text-sm">
          Thanks for helping us improve. Our team will investigate the issue.
        </p>
        <button
          type="button"
          onClick={() => {
            handleReset();
            onClose?.();
          }}
          className="mt-2 px-5 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-black font-semibold min-h-[44px]"
        >
          Done
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Title */}
      <div>
        <label htmlFor="bug-title" className="block text-sm font-medium text-gray-300 mb-1">
          Title <span className="text-red-400">*</span>
        </label>
        <input
          id="bug-title"
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
          minLength={5}
          maxLength={200}
          placeholder="Brief summary of the issue"
          className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-amber-500"
        />
      </div>

      {/* Severity + Category row */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor="bug-severity" className="block text-sm font-medium text-gray-300 mb-1">
            Severity
          </label>
          <select
            id="bug-severity"
            value={severity}
            onChange={(e) => setSeverity(e.target.value as BugSeverity)}
            className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
          >
            {SEVERITIES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="bug-category" className="block text-sm font-medium text-gray-300 mb-1">
            Category
          </label>
          <select
            id="bug-category"
            value={category}
            onChange={(e) => setCategory(e.target.value as BugCategory)}
            className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
          >
            {BUG_CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Description */}
      <div>
        <label htmlFor="bug-description" className="block text-sm font-medium text-gray-300 mb-1">
          Description <span className="text-red-400">*</span>
        </label>
        <textarea
          id="bug-description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          required
          minLength={10}
          maxLength={5000}
          rows={4}
          placeholder="Describe what went wrong…"
          className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-amber-500 resize-y"
        />
        <p className="mt-1 text-xs text-gray-500 text-right">{description.length}/5000</p>
      </div>

      {/* Optional details toggle */}
      <button
        type="button"
        onClick={() => setShowOptional((v) => !v)}
        className="text-sm text-amber-400 hover:text-amber-300 underline focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 rounded"
        aria-expanded={showOptional}
      >
        {showOptional ? '− Hide additional details' : '+ Add steps to reproduce & more'}
      </button>

      {showOptional && (
        <div className="space-y-4 border-t border-gray-700 pt-4">
          {/* Steps to reproduce */}
          <div>
            <label htmlFor="bug-steps" className="block text-sm font-medium text-gray-300 mb-1">
              Steps to Reproduce <span className="text-gray-500">(optional)</span>
            </label>
            <textarea
              id="bug-steps"
              value={steps}
              onChange={(e) => setSteps(e.target.value)}
              minLength={steps.length > 0 ? 5 : 0}
              maxLength={5000}
              rows={3}
              placeholder="1. Go to…&#10;2. Click…&#10;3. See error"
              className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-amber-500 resize-y"
            />
          </div>

          {/* Expected behavior */}
          <div>
            <label
              htmlFor="bug-expected"
              className="block text-sm font-medium text-gray-300 mb-1"
            >
              Expected Behavior <span className="text-gray-500">(optional)</span>
            </label>
            <textarea
              id="bug-expected"
              value={expected}
              onChange={(e) => setExpected(e.target.value)}
              minLength={expected.length > 0 ? 5 : 0}
              maxLength={2000}
              rows={2}
              placeholder="What did you expect to happen?"
              className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-amber-500 resize-y"
            />
          </div>

          {/* Actual behavior */}
          <div>
            <label
              htmlFor="bug-actual"
              className="block text-sm font-medium text-gray-300 mb-1"
            >
              Actual Behavior <span className="text-gray-500">(optional)</span>
            </label>
            <textarea
              id="bug-actual"
              value={actual}
              onChange={(e) => setActual(e.target.value)}
              minLength={actual.length > 0 ? 5 : 0}
              maxLength={2000}
              rows={2}
              placeholder="What actually happened?"
              className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-amber-500 resize-y"
            />
          </div>
        </div>
      )}

      {/* Severity badge */}
      <p className="text-xs text-gray-500">
        Severity:{' '}
        <span className={SEVERITIES.find((s) => s.value === severity)?.color ?? ''}>
          {severity.charAt(0).toUpperCase() + severity.slice(1)}
        </span>
        . Browser info will be collected automatically.
      </p>

      {/* Error */}
      {error && (
        <p role="alert" className="text-red-400 text-sm">
          {error.message}
        </p>
      )}

      {/* Actions */}
      <div className="flex gap-3 pt-1">
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="flex-1 min-h-[44px] rounded-lg border border-gray-600 hover:bg-gray-800 text-white"
          >
            Cancel
          </button>
        )}
        <button
          type="submit"
          disabled={
            isSubmitting ||
            title.trim().length < 5 ||
            description.trim().length < 10
          }
          className="flex-1 min-h-[44px] rounded-lg bg-amber-500 hover:bg-amber-400 disabled:opacity-50 disabled:cursor-not-allowed text-black font-semibold flex items-center justify-center gap-2"
        >
          {isSubmitting && (
            <svg
              className="animate-spin h-4 w-4"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
              />
            </svg>
          )}
          {isSubmitting ? 'Submitting…' : 'Submit Bug Report'}
        </button>
      </div>
    </form>
  );
}

/**
 * BugReportModal — renders as a modal overlay when `asModal` is true,
 * or inline (no overlay) when `asModal` is false (default).
 *
 * Fields:
 *   - Title (required)
 *   - Severity select (low / medium / high / critical)
 *   - Category select (ui / transaction / wallet / market / general)
 *   - Description (required)
 *   - Steps to reproduce (optional, collapsible)
 *   - Expected behavior (optional, collapsible)
 *   - Actual behavior (optional, collapsible)
 *   - Browser info collected automatically
 */
export function BugReportModal({ asModal = false, onClose, token }: BugReportFormProps) {
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!asModal) return;

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { onClose?.(); return; }
      if (e.key !== 'Tab' || !dialogRef.current) return;
      const focusable = Array.from(
        dialogRef.current.querySelectorAll<HTMLElement>(FOCUSABLE),
      );
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey) {
        if (document.activeElement === first) { e.preventDefault(); last.focus(); }
      } else {
        if (document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };

    window.addEventListener('keydown', onKey);
    const firstFocusable = dialogRef.current?.querySelector<HTMLElement>(FOCUSABLE);
    firstFocusable?.focus();

    return () => window.removeEventListener('keydown', onKey);
  }, [asModal, onClose]);

  const inner = (
    <div
      ref={dialogRef}
      className="bg-gray-900 rounded-xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex items-center justify-between mb-5">
        <h2 id="bug-report-modal-title" className="text-lg font-bold text-white">
          Report a Bug
        </h2>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Close bug report form"
            className="text-gray-400 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 rounded"
          >
            ✕
          </button>
        )}
      </div>
      <BugReportFormContent onClose={onClose} token={token} />
    </div>
  );

  if (!asModal) return inner;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="bug-report-modal-title"
    >
      {inner}
    </div>
  );
}
