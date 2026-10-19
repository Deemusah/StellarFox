export interface FAQItem {
  id: string;
  question: string;
  answer: string;
  tags?: string[];
}

export interface HelpTopic {
  id: string;
  title: string;
  description: string;
  faqs: FAQItem[];
}

/**
 * Contextual help content keyed by page/route.
 * The `default` topic is used when no page-specific topic matches.
 */
export const helpTopics: Record<string, HelpTopic> = {
  default: {
    id: 'default',
    title: 'General Help',
    description: 'Answers to common questions about using StellarFox.',
    faqs: [
      {
        id: 'getting-started',
        question: 'How do I get started?',
        answer:
          'Create an account, connect your wallet, and follow the onboarding checklist on your dashboard to explore the main features.',
        tags: ['onboarding', 'account'],
      },
      {
        id: 'reset-password',
        question: 'How do I reset my password?',
        answer:
          'Open your account settings, choose Security, and select "Reset password". You will receive a confirmation email with the next steps.',
        tags: ['account', 'security'],
      },
      {
        id: 'contact-support',
        question: 'How can I contact support?',
        answer:
          'Use the contact form in this help panel. Include as much detail as possible so our team can respond quickly.',
        tags: ['support'],
      },
    ],
  },
  dashboard: {
    id: 'dashboard',
    title: 'Dashboard Help',
    description: 'Everything you need to know about your dashboard.',
    faqs: [
      {
        id: 'dashboard-widgets',
        question: 'Can I customize my dashboard widgets?',
        answer:
          'Yes. Open the dashboard settings and drag widgets to reorder them, or toggle visibility for the ones you do not need.',
        tags: ['dashboard', 'customization'],
      },
      {
        id: 'dashboard-refresh',
        question: 'Why is my dashboard data out of date?',
        answer:
          'Dashboard data refreshes automatically. You can also pull to refresh or reload the page to fetch the latest values.',
        tags: ['dashboard', 'data'],
      },
    ],
  },
  wallet: {
    id: 'wallet',
    title: 'Wallet Help',
    description: 'Support for connecting and managing your wallet.',
    faqs: [
      {
        id: 'wallet-connect',
        question: 'How do I connect my wallet?',
        answer:
          'Select "Connect Wallet" in the header, choose your provider, and approve the connection request in your wallet extension.',
        tags: ['wallet', 'connection'],
      },
      {
        id: 'wallet-disconnect',
        question: 'How do I disconnect my wallet?',
        answer:
          'Open the wallet menu in the header and choose "Disconnect". You can reconnect at any time.',
        tags: ['wallet', 'connection'],
      },
    ],
  },
  settings: {
    id: 'settings',
    title: 'Settings Help',
    description: 'Manage your account preferences and security.',
    faqs: [
      {
        id: 'settings-notifications',
        question: 'How do I change my notification preferences?',
        answer:
          'Go to Settings, open the Notifications section, and toggle the channels you want to receive updates on.',
        tags: ['settings', 'notifications'],
      },
      {
        id: 'settings-security',
        question: 'How do I enable two-factor authentication?',
        answer:
          'In Settings, open Security and follow the prompts to enable two-factor authentication for your account.',
        tags: ['settings', 'security'],
      },
    ],
  },
};

/**
 * Resolve the help topic for a given pathname.
 * Falls back to the default topic when no page-specific topic matches.
 */
export function getHelpTopicForPath(pathname: string): HelpTopic {
  if (!pathname) {
    return helpTopics.default;
  }

  const normalized = pathname.toLowerCase();
  const match = Object.keys(helpTopics).find(
    (key) => key !== 'default' && normalized.includes(key),
  );

  return match ? helpTopics[match] : helpTopics.default;
}

/**
 * Filter FAQs by a search query across question, answer, and tags.
 */
export function searchFaqs(faqs: FAQItem[], query: string): FAQItem[] {
  const trimmed = query.trim().toLowerCase();
  if (!trimmed) {
    return faqs;
  }

  return faqs.filter((faq) => {
    const haystack = [faq.question, faq.answer, ...(faq.tags ?? [])]
      .join(' ')
      .toLowerCase();
    return haystack.includes(trimmed);
  });
}
