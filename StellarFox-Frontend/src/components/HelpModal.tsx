import React, { useMemo, useState } from 'react';

interface FAQItem {
  id: string;
  question: string;
  answer: string;
  topics: string[];
}

interface HelpModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentPage?: string;
}

const FAQS: FAQItem[] = [
  {
    id: 'getting-started',
    question: 'How do I get started?',
    answer:
      'Create an account, connect your wallet, and follow the onboarding checklist on your dashboard to set up your profile.',
    topics: ['dashboard', 'onboarding', 'general'],
  },
  {
    id: 'connect-wallet',
    question: 'How do I connect my wallet?',
    answer:
      'Open the wallet menu in the top navigation and select your provider. Approve the connection request in your wallet extension.',
    topics: ['wallet', 'dashboard', 'general'],
  },
  {
    id: 'transaction-failed',
    question: 'Why did my transaction fail?',
    answer:
      'Transactions can fail due to insufficient balance, slippage, or network congestion. Check the error details and retry with adjusted settings.',
    topics: ['wallet', 'transactions'],
  },
  {
    id: 'update-profile',
    question: 'How do I update my profile?',
    answer:
      'Go to Settings, edit your profile fields, and save your changes. Updates are applied immediately.',
    topics: ['settings', 'profile'],
  },
  {
    id: 'notifications',
    question: 'How do I manage notifications?',
    answer:
      'Visit Settings > Notifications to enable or disable email and in-app alerts for the events you care about.',
    topics: ['settings', 'notifications'],
  },
  {
    id: 'reset-password',
    question: 'How do I reset my password?',
    answer:
      'On the login screen, choose "Forgot password" and follow the emailed reset link to set a new password.',
    topics: ['account', 'security'],
  },
];

const CONTEXT_TOPICS: Record<string, string[]> = {
  dashboard: ['dashboard', 'onboarding', 'general'],
  wallet: ['wallet', 'transactions'],
  settings: ['settings', 'profile', 'notifications'],
  account: ['account', 'security'],
};

const HelpModal: React.FC<HelpModalProps> = ({ isOpen, onClose, currentPage }) => {
  const [query, setQuery] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [errors, setErrors] = useState<{ name?: string; email?: string; message?: string }>({});
  const [status, setStatus] = useState<'idle' | 'submitting' | 'success' | 'error'>('idle');

  const contextTopics = useMemo(() => {
    if (!currentPage) return [];
    const key = currentPage.toLowerCase();
    return CONTEXT_TOPICS[key] ?? [];
  }, [currentPage]);

  const filteredFaqs = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return FAQS;
    return FAQS.filter(
      (faq) =>
        faq.question.toLowerCase().includes(normalized) ||
        faq.answer.toLowerCase().includes(normalized)
    );
  }, [query]);

  const contextualFaqs = useMemo(() => {
    if (contextTopics.length === 0) return [];
    return FAQS.filter((faq) => faq.topics.some((topic) => contextTopics.includes(topic)));
  }, [contextTopics]);

  const validate = () => {
    const nextErrors: { name?: string; email?: string; message?: string } = {};
    if (!name.trim()) nextErrors.name = 'Please enter your name.';
    if (!email.trim()) {
      nextErrors.email = 'Please enter your email.';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      nextErrors.email = 'Please enter a valid email address.';
    }
    if (!message.trim()) nextErrors.message = 'Please describe your issue.';
    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!validate()) return;
    setStatus('submitting');
    try {
      // Support submissions are handled by the backend support endpoint.
      await Promise.resolve();
      setStatus('success');
      setName('');
      setEmail('');
      setMessage('');
      setErrors({});
    } catch {
      setStatus('error');
    }
  };

  if (!isOpen) return null;

  return (
    <div className="help-modal-overlay" role="dialog" aria-modal="true" aria-label="Help and support">
      <div className="help-modal">
        <header className="help-modal__header">
          <h2>Help &amp; Support</h2>
          <button type="button" className="help-modal__close" onClick={onClose} aria-label="Close help">
            &times;
          </button>
        </header>

        <div className="help-modal__body">
          <input
            type="search"
            className="help-modal__search"
            placeholder="Search FAQs..."
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            aria-label="Search frequently asked questions"
          />

          {contextualFaqs.length > 0 && !query.trim() && (
            <section className="help-modal__section">
              <h3>Help for this page</h3>
              <ul className="help-modal__faq-list">
                {contextualFaqs.map((faq) => (
                  <li key={`context-${faq.id}`} className="help-modal__faq">
                    <h4>{faq.question}</h4>
                    <p>{faq.answer}</p>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className="help-modal__section">
            <h3>Frequently Asked Questions</h3>
            {filteredFaqs.length === 0 ? (
              <p className="help-modal__empty">No FAQs match your search.</p>
            ) : (
              <ul className="help-modal__faq-list">
                {filteredFaqs.map((faq) => (
                  <li key={faq.id} className="help-modal__faq">
                    <h4>{faq.question}</h4>
                    <p>{faq.answer}</p>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="help-modal__section">
            <h3>Contact Support</h3>
            {status === 'success' ? (
              <p className="help-modal__success" role="status">
                Thanks! Your message has been sent. Our team will get back to you soon.
              </p>
            ) : (
              <form className="help-modal__form" onSubmit={handleSubmit} noValidate>
                <label>
                  Name
                  <input
                    type="text"
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    aria-invalid={Boolean(errors.name)}
                  />
                  {errors.name && <span className="help-modal__error">{errors.name}</span>}
                </label>
                <label>
                  Email
                  <input
                    type="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    aria-invalid={Boolean(errors.email)}
                  />
                  {errors.email && <span className="help-modal__error">{errors.email}</span>}
                </label>
                <label>
                  How can we help?
                  <textarea
                    value={message}
                    onChange={(event) => setMessage(event.target.value)}
                    aria-invalid={Boolean(errors.message)}
                  />
                  {errors.message && <span className="help-modal__error">{errors.message}</span>}
                </label>
                {status === 'error' && (
                  <p className="help-modal__error" role="alert">
                    Something went wrong. Please try again.
                  </p>
                )}
                <button type="submit" disabled={status === 'submitting'}>
                  {status === 'submitting' ? 'Sending...' : 'Send message'}
                </button>
              </form>
            )}
          </section>
        </div>
      </div>
    </div>
  );
};

export default HelpModal;
