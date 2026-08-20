import type { Metadata } from 'next';
import Link from 'next/link';
import styles from '@/components/legal.module.css';

export const metadata: Metadata = {
  title: 'Delete your account',
  description:
    'How to delete your Abroadster account and associated data from the app or by email.',
};

export default function DeleteAccountPage() {
  return (
    <article className={`wrap ${styles.doc}`}>
      <p className={styles.eyebrow}>Abroadster · Account deletion</p>
      <h1 className={styles.title}>Delete your Abroadster account and data</h1>
      <p className={styles.lead}>
        This page is for users of the Abroadster mobile app. It explains how to
        request that your account and associated data be deleted, what is
        deleted, and what may be retained.
      </p>

      <div className={styles.box}>
        <strong>App / developer name:</strong> Abroadster
        <br />
        <strong>Support:</strong>{' '}
        <a href="mailto:samimoudarres@hotmail.com">samimoudarres@hotmail.com</a>
        {' · '}
        <Link href="/support">Support page</Link>
      </div>

      <section className={styles.section}>
        <h2>How to request account deletion (in the app)</h2>
        <ol className={styles.list}>
          <li>
            Open the <strong>Abroadster</strong> app and sign in with the
            account you want deleted.
          </li>
          <li>
            Go to your <strong>Profile</strong> tab.
          </li>
          <li>
            Tap the menu (⋯) → <strong>Settings</strong>.
          </li>
          <li>
            Scroll to <strong>Delete account</strong>, tap it, and confirm.
          </li>
        </ol>
        <p style={{ marginTop: '0.75rem' }}>
          Deletion begins immediately after you confirm in the app.
        </p>
      </section>

      <section className={styles.section}>
        <h2>How to request account deletion by email</h2>
        <ol className={styles.list}>
          <li>
            Email{' '}
            <a href="mailto:samimoudarres@hotmail.com">
              samimoudarres@hotmail.com
            </a>{' '}
            from the email address on your Abroadster account.
          </li>
          <li>
            Use the subject line: <strong>Delete my Abroadster account</strong>.
          </li>
          <li>Include the name and email associated with the account.</li>
        </ol>
        <p style={{ marginTop: '0.75rem' }}>
          We will verify the request and complete deletion within{' '}
          <strong>30 days</strong>.
        </p>
      </section>

      <section className={styles.section}>
        <h2>Data that is deleted</h2>
        <p>
          When your account is deleted, Abroadster deletes or irreversibly
          anonymizes data associated with your account, including:
        </p>
        <ul className={styles.list}>
          <li>
            Your profile (name, bio, schools, host city, avatar)
          </li>
          <li>
            Your posts, photos you uploaded for posts, stamps, and tags
          </li>
          <li>
            Friendships, blocks, trip memberships, and notification preferences
            tied to your account
          </li>
          <li>
            Direct-message and community messages you sent (removed or
            anonymized so your identity is no longer shown)
          </li>
          <li>Account authentication credentials for that login</li>
        </ul>
      </section>

      <section className={styles.section}>
        <h2>Data that may be kept, and retention</h2>
        <ul className={styles.list}>
          <li>
            <strong>Messages visible to other users:</strong> Conversation
            history may remain for other participants with your identity removed
            or shown as a deleted user, so their chat history is not broken.
          </li>
          <li>
            <strong>Safety / legal records:</strong> Reports you submitted or
            that concern you, and records we must keep for fraud prevention,
            security, or legal compliance, may be retained for up to{' '}
            <strong>90 days</strong> (or longer if required by law), then
            deleted or further anonymized.
          </li>
          <li>
            <strong>Backups:</strong> Encrypted backups may retain residual
            copies for up to <strong>30 days</strong> before they are purged
            from rotating backup cycles.
          </li>
          <li>
            <strong>Aggregated analytics:</strong> Non-identifying, aggregated
            usage statistics (not linked to your account) may be kept.
          </li>
        </ul>
      </section>

      <section className={styles.section}>
        <h2>After deletion</h2>
        <p>
          You will no longer be able to sign in to that Abroadster account.
          Creating a new account later starts fresh and does not restore deleted
          data.
        </p>
        <p className={styles.meta} style={{ marginTop: '1rem' }}>
          <Link href="/privacy">Privacy Policy</Link>
          {' · '}
          <Link href="/terms">Terms of Use</Link>
        </p>
      </section>
    </article>
  );
}
