import type { Metadata } from 'next';
import Link from 'next/link';
import { ContactForm } from '@/components/ContactForm';
import { Reveal } from '@/components/Reveal';
import { SITE } from '@/lib/site';
import styles from '../contact/contact.module.css';

export const metadata: Metadata = {
  title: 'Support',
  description:
    'Get help with Abroadster: account support, delete account, privacy, and contact the team.',
};

export default function SupportPage() {
  return (
    <div className={`wrap ${styles.page}`}>
      <Reveal className={styles.intro}>
        <h1 className="type-bold">Abroadster Support</h1>
        <p className="muted">
          Need help with the Abroadster app? Send a message with the form below
          and we’ll reply to the email you provide. Your note is stored securely
          — you never need our personal inbox address.
        </p>
        <ul className={styles.list}>
          <li>
            <strong>App help:</strong> login, map, trips, chat, albums, profile
          </li>
          <li>
            <strong>Account deletion:</strong> in the app go to Profile →
            Settings → Delete account, or follow{' '}
            <a href={SITE.deleteAccountUrl} target="_blank" rel="noopener noreferrer">
              these instructions
            </a>
          </li>
          <li>
            <strong>Privacy:</strong>{' '}
            <a href={SITE.privacyUrl} target="_blank" rel="noopener noreferrer">
              Privacy Policy
            </a>
            {' · '}
            <a href={SITE.termsUrl} target="_blank" rel="noopener noreferrer">
              Terms of Use
            </a>
          </li>
          <li>
            <strong>More about the product:</strong>{' '}
            <Link href="/features">How it works</Link>
            {' · '}
            <Link href="/contact">Contact</Link>
          </li>
        </ul>
      </Reveal>
      <Reveal className={styles.panel}>
        <h2 className="type-bold" style={{ marginTop: 0, fontSize: '1.35rem' }}>
          Send a support message
        </h2>
          <ContactForm source="support" />
      </Reveal>
    </div>
  );
}
