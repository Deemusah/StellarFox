import { useState, useCallback } from 'react';
import { submitBugReport } from '../services/api';

export type BugSeverity = 'low' | 'medium' | 'high' | 'critical';
export type BugCategory = 'ui' | 'transaction' | 'wallet' | 'market' | 'general';

export interface UseBugReportResult {
  submit: (
    input: {
      title: string;
      description: string;
      severity?: BugSeverity;
      category?: BugCategory;
      stepsToReproduce?: string;
      expectedBehavior?: string;
      actualBehavior?: string;
      pageUrl?: string;
      browserInfo?: Record<string, unknown>;
    },
    token?: string,
  ) => Promise<void>;
  isSubmitting: boolean;
  error: Error | null;
  success: boolean;
  reset: () => void;
}

export function useBugReport(): UseBugReportResult {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [success, setSuccess] = useState(false);

  const submit = useCallback(
    async (
      input: {
        title: string;
        description: string;
        severity?: BugSeverity;
        category?: BugCategory;
        stepsToReproduce?: string;
        expectedBehavior?: string;
        actualBehavior?: string;
        pageUrl?: string;
        browserInfo?: Record<string, unknown>;
      },
      token?: string,
    ) => {
      setIsSubmitting(true);
      setError(null);
      setSuccess(false);
      try {
        await submitBugReport(input, token);
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
