import type { Metadata } from 'next';
import { ContactForm } from '@/components/ContactForm';
import { Reveal } from '@/components/Reveal';
import styles from './contact.module.css';

export const metadata: Metadata = {
  title: 'Contact',
  description: 'Get in touch with the Abroadster team.',
};

export default function ContactPage() {
  return (
    <div className={`wrap ${styles.page}`}>
      <Reveal className={styles.intro}>
        <h1 className="type-bold">Contact</h1>
        <p className="muted">
          Partnerships, press, schools, bugs, or hellos. Send a note and we’ll
          reply.
        </p>
      </Reveal>
      <Reveal className={styles.panel}>
        <ContactForm />
      </Reveal>
    </div>
  );
}
