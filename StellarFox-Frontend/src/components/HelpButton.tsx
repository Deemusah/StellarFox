import { useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';

interface FaqItem {
  id: string;
  question: string;
  answer: string;
  topics: string[];
}

const FAQS: FaqItem[] = [
  {
    id: 'getting-started',
    question: 'How do I get started?',
    answer:
      'Create an account, connect your wallet, and follow the onboarding checklist on the dashboard to set up your profile.',
    topics: ['dashboard', 'onboarding', 'general'],
  },
  {
    id: 'connect-wallet',
    question: 'How do I connect my wallet?',
    answer:
      'Open the wallet menu in the top navigation and select “Connect Wallet”. Approve the connection request in your wallet extension.',
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
      'Go to Settings → Profile to change your display name, avatar, and notification preferences.',
    topics: ['settings', 'profile'],
  },
  {
    id: 'notifications',
    question: 'How do I manage notifications?',
    answer:
      'Visit Settings → Notifications to enable or disable email and in-app alerts for the events you care about.',
    topics: ['settings', 'notifications'],
  },
  {
    id: 'reset-password',
    question: 'How do I reset my password?',
    answer:
      'On the sign-in screen choose “Forgot password” and follow the emailed reset link to set a new password.',
    topics: ['auth', 'account'],
  },
];

const CONTEXT_TOPICS: Record<string, string[]> = {
  '/': ['general', 'onboarding'],
  '/dashboard': ['dashboard', 'onboarding'],
  '/wallet': ['wallet', 'transactions'],
  '/settings': ['settings', 'profile', 'notifications'],
  '/profile': ['profile', 'settings'],
};

function topicsForPath(pathname: string): string[] {
  if (CONTEXT_TOPICS[pathname]) return CONTEXT_TOPICS[pathname];
  const match = Object.keys(CONTEXT_TOPICS).find(
    (path) => path !== '/' && pathname.startsWith(path),
  );
  return match ? CONTEXT_TOPICS[match] : ['general'];
}

interface ContactFormState {
  name: string;
  email: string;
  message: string;
}

const EMPTY_FORM: ContactFormState = { name: '', email: '', message: '' };

export default function HelpButton() {
  const location = useLocation();
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [form, setForm] = useState<ContactFormState>(EMPTY_FORM);
  const [errors, setErrors] = useState<Partial<ContactFormState>>({});
  const [status, setStatus] = useState<'idle' | 'submitting' | 'success' | 'error'>(
    'idle',
  );

  const contextTopics = useMemo(
    () => topicsForPath(location.pathname),
    [location.pathname],
  );

  const filteredFaqs = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    const contextual = FAQS.filter((faq) =>
      faq.topics.some((topic) => contextTopics.includes(topic)),
    );
    const pool = normalized ? FAQS : contextual;
    if (!normalized) return pool;
    return pool.filter(
      (faq) =>
        faq.question.toLowerCase().includes(normalized) ||
        faq.answer.toLowerCase().includes(normalized),
    );
  }, [query, contextTopics]);

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen]);

  const closeModal = () => {
    setIsOpen(false);
    setQuery('');
    setForm(EMPTY_FORM);
    setErrors({});
    setStatus('idle');
  };

  const validate = (): Partial<ContactFormState> => {
    const next: Partial<ContactFormState> = {};
    if (!form.name.trim()) next.name = 'Please enter your name.';
    if (!form.email.trim()) {
      next.email = 'Please enter your email.';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
      next.email = 'Please enter a valid email address.';
    }
    if (!form.message.trim()) next.message = 'Please describe your issue.';
    return next;
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const validationErrors = validate();
    setErrors(validationErrors);
    if (Object.keys(validationErrors).length > 0) return;

    setStatus('submitting');
    try {
      const response = await fetch('/api/support/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, page: location.pathname }),
      });
      if (!response.ok) throw new Error('Request failed');
      setStatus('success');
      setForm(EMPTY_FORM);
    } catch {
      setStatus('error');
    }
  };

  return (
    <>
      <button
        type="button"
        className="help-button"
        aria-label="Open help and support"
        onClick={() => setIsOpen(true)}
      >
        Help
      </button>

      {isOpen && (
        <div
          className="help-modal-overlay"
          role="presentation"
          onClick={closeModal}
        >
          <div
            className="help-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Help and support"
            onClick={(event) => event.stopPropagation()}
          >
            <header className="help-modal__header">
              <h2>Help &amp; Support</h2>
              <button
                type="button"
                className="help-modal__close"
                aria-label="Close help"
                onClick={closeModal}
              >
                ×
              </button>
            </header>

            <section className="help-modal__faqs">
              <label htmlFor="help-search">Search FAQs</label>
              <input
                id="help-search"
                type="search"
                value={query}
                placeholder="Search for answers…"
                onChange={(event) => setQuery(event.target.value)}
              />

              {filteredFaqs.length === 0 ? (
                <p className="help-modal__empty">
                  No FAQs match your search. Try different keywords or contact
                  support below.
                </p>
              ) : (
                <ul className="help-modal__faq-list">
                  {filteredFaqs.map((faq) => (
                    <li key={faq.id}>
                      <details>
                        <summary>{faq.question}</summary>
                        <p>{faq.answer}</p>
                      </details>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="help-modal__contact">
              <h3>Contact support</h3>
              {status === 'success' ? (
                <p role="status" className="help-modal__success">
                  Thanks! Your message has been sent. We’ll get back to you soon.
                </p>
              ) : (
                <form onSubmit={handleSubmit} noValidate>
                  <div>
                    <label htmlFor="help-name">Name</label>
                    <input
                      id="help-name"
                      type="text"
                      value={form.name}
                      onChange={(event) =>
                        setForm({ ...form, name: event.target.value })
                      }
                    />
                    {errors.name && (
                      <span className="help-modal__error">{errors.name}</span>
                    )}
                  </div>
                  <div>
                    <label htmlFor="help-email">Email</label>
                    <input
                      id="help-email"
                      type="email"
                      value={form.email}
                      onChange={(event) =>
                        setForm({ ...form, email: event.target.value })
                      }
                    />
                    {errors.email && (
                      <span className="help-modal__error">{errors.email}</span>
                    )}
                  </div>
                  <div>
                    <label htmlFor="help-message">Message</label>
                    <textarea
                      id="help-message"
                      value={form.message}
                      onChange={(event) =>
                        setForm({ ...form, message: event.target.value })
                      }
                    />
                    {errors.message && (
                      <span className="help-modal__error">{errors.message}</span>
                    )}
                  </div>
                  {status === 'error' && (
                    <p role="alert" className="help-modal__error">
                      Something went wrong sending your message. Please try
                      again.
                    </p>
                  )}
                  <button type="submit" disabled={status === 'submitting'}>
                    {status === 'submitting' ? 'Sending…' : 'Send message'}
                  </button>
                </form>
              )}
            </section>
          </div>
        </div>
      )}
    </>
  );
}
