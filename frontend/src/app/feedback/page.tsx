import type { Metadata } from 'next';
import { FeedbackModal } from '@/components/ui/FeedbackModal';

export const metadata: Metadata = {
  title: 'Feedback — BANKERCHANGER',
  description: 'Share your feedback to help improve BANKERCHANGER.',
};

/**
 * /feedback — Inline feedback submission page.
 *
 * Renders the FeedbackModal form directly on the page (not as an overlay).
 * No authentication required — anonymous feedback is accepted.
 */
export default function FeedbackPage() {
  return (
    <main className="min-h-screen bg-gray-950 px-4 py-16">
      <div className="max-w-lg mx-auto">
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-bold text-white mb-2">Share Your Feedback</h1>
          <p className="text-gray-400">
            Your input helps us build a better prediction market. All feedback is
            anonymous by default.
          </p>
        </div>

        {/* FeedbackModal rendered inline (asModal=false, no onClose) */}
        <FeedbackModal />
      </div>
    </main>
  );
}
