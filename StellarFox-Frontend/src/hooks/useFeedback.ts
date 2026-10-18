// frontend/src/hooks/useFeedback.ts
// Hook for submitting user feedback.

import { useState, useCallback } from 'react';
import { submitFeedback } from '../services/api';

export type FeedbackCategory =
  | 'general'
  | 'feature_request'
  | 'ux'
  | 'performance'
  | 'other';

export interface UseFeedbackInput {
  category: FeedbackCategory;
  /** Optional 1–5 star rating */
  rating?: number;
  message: string;
  pageUrl?: string;
}

export interface UseFeedbackResult {
  /** Call to submit a feedback entry. Optionally pass a JWT token for auth. */
  submit: (input: UseFeedbackInput, token?: string) => Promise<void>;
  isSubmitting: boolean;
  error: Error | null;
  success: boolean;
  /** Resets error and success state, e.g. after the modal is closed. */
  reset: () => void;
}

export function useFeedback(): UseFeedbackResult {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [success, setSuccess] = useState(false);

  const submit = useCallback(
    async (input: UseFeedbackInput, token?: string) => {
      setIsSubmitting(true);
      setError(null);
      setSuccess(false);
      try {
        await submitFeedback(input, token);
        setSuccess(true);
      } catch (e) {
        setError(e as Error);
      } finally {
        setIsSubmitting(false);
      }
    },
    [],
  );

  const reset = useCallback(() => {
    setError(null);
    setSuccess(false);
  }, []);

  return { submit, isSubmitting, error, success, reset };
}
