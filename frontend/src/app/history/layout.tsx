import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Prediction History — BANKERCHANGER',
  description: 'View your prediction history, analyze performance, and track all your bets.',
};

export default function HistoryLayout({ children }: { children: React.ReactNode }) {
  return children;
}
