'use client';

import { useState, useEffect, useRef, FormEvent } from 'react';
import { useFeedback, FeedbackCategory } from '../../hooks/useFeedback';

interface FeedbackFormProps {
  /** When true, wraps the form in a modal overlay. When false, renders inline. */
  asModal?: boolean;
  onClose?: () => void;
  /** Optional Bearer token for authenticated submissions */
  token?: string;
}

const CATEGORIES: { value: FeedbackCategory; label: string }[] = [
  { value: 'general', label: 'General' },
  { value: 'feature_request', label: 'Feature Request' },
  { value: 'ux', label: 'UX / Design' },
  { value: 'performance', label: 'Performance' },
  { value: 'other', label: 'Other' },
];

const FOCUSABLE = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

function StarRating({
  value,
  onChange,
}: {
  value: number | undefined;
  onChange: (v: number) => void;
}) {
  return (
    <div className="flex gap-1" role="group" aria-label="Rating (optional)">
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          type="button"
          onClick={() => onChange(star === value ? 0 : star)}
          aria-label={`${star} star${star !== 1 ? 's' : ''}`}
          aria-pressed={value === star}
          className={`text-2xl transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 rounded ${
            value !== undefined && star <= value
              ? 'text-amber-400'
              : 'text-gray-600 hover:text-amber-300'
          }`}
        >
          ★
        </button>
      ))}
    </div>
  );
}

function FeedbackFormContent({
  onClose,
  token,
}: {
  onClose?: () => void;
  token?: string;
}) {
  const { submit, isSubmitting, error, success, reset } = useFeedback();
  const [category, setCategory] = useState<FeedbackCategory>('general');
  const [rating, setRating] = useState<number | undefined>(undefined);
  const [message, setMessage] = useState('');

  const pageUrl =
    typeof window !== 'undefined' ? window.location.href : undefined;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    await submit(
      {
        category,
        rating: rating && rating > 0 ? rating : undefined,
        message,
        pageUrl,
      },
      token,
    );
  };

  if (success) {
    return (
      <div className="flex flex-col items-center gap-4 py-6 text-center">
        <div className="text-5xl" aria-hidden="true">🎉</div>
        <h3 className="text-lg font-semibold text-white">Thanks for your feedback!</h3>
        <p className="text-gray-400 text-sm">Your input helps us improve BANKERCHANGER.</p>
        <button
          type="button"
          onClick={() => {
            reset();
            setMessage('');
            setRating(undefined);
            setCategory('general');
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
    <form onSubmit={handleSubmit} className="space-y-5">
      {/* Category */}
      <div>
        <label
          htmlFor="feedback-category"
          className="block text-sm font-medium text-gray-300 mb-1"
        >
          Category
        </label>
        <select
          id="feedback-category"
          value={category}
          onChange={(e) => setCategory(e.target.value as FeedbackCategory)}
          className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
        >
          {CATEGORIES.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </select>
      </div>

      {/* Star rating */}
      <div>
        <p className="block text-sm font-medium text-gray-300 mb-1">
          Rating <span className="text-gray-500">(optional)</span>
        </p>
        <StarRating value={rating} onChange={setRating} />
      </div>

      {/* Message */}
      <div>
        <label
          htmlFor="feedback-message"
          className="block text-sm font-medium text-gray-300 mb-1"
        >
          Message
        </label>
        <textarea
          id="feedback-message"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          required
          minLength={5}
          maxLength={2000}
          rows={4}
          placeholder="Tell us what you think…"
          className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-amber-500 resize-y"
        />
        <p className="mt-1 text-xs text-gray-500 text-right">{message.length}/2000</p>
      </div>

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
          disabled={isSubmitting || message.trim().length < 5}
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
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
            </svg>
          )}
          {isSubmitting ? 'Submitting…' : 'Submit Feedback'}
        </button>
      </div>
    </form>
  );
}

/**
 * FeedbackModal — renders as a modal overlay when `asModal` is true,
 * or inline (no overlay) when `asModal` is false (default).
 *
 * Use `asModal={true}` with `onClose` for a dialog overlay.
 * Use `asModal={false}` (or omit) to embed the form on a page.
 */
export function FeedbackModal({ asModal = false, onClose, token }: FeedbackFormProps) {
  const dialogRef = useRef<HTMLDivElement>(null);

  // Focus trap & Escape key handling when used as a modal
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
      className="bg-gray-900 rounded-xl p-6 w-full max-w-md"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex items-center justify-between mb-5">
        <h2 id="feedback-modal-title" className="text-lg font-bold text-white">
          Share Feedback
        </h2>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Close feedback form"
            className="text-gray-400 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 rounded"
          >
            ✕
          </button>
        )}
      </div>
      <FeedbackFormContent onClose={onClose} token={token} />
    </div>
  );

  if (!asModal) return inner;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="feedback-modal-title"
    >
      {inner}
    </div>
  );
}
