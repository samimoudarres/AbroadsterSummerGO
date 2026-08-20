import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { Phone } from '@/components/Phone';
import { Reveal } from '@/components/Reveal';
import { FEATURES, SITE } from '@/lib/site';
import styles from './features.module.css';

export const metadata: Metadata = {
  title: 'How it works',
  description:
    'Map, trips, albums, chats, stamps, and profiles. How Abroadster works.',
};

export default function FeaturesPage() {
  return (
    <div className={styles.page}>
      <section className={`wrap ${styles.strip}`}>
        <h1 className="type-bold">How it works</h1>
        <p className="type">
          Six screens from the real app. Scroll through and see what you get.
        </p>
      </section>

      <section className="wrap">
        {FEATURES.map((f, i) => (
          <Reveal
            key={f.slug}
            id={f.slug}
            className={`${styles.row} ${i % 2 === 1 ? styles.flip : ''}`}
          >
            <div className={styles.copy}>
              <span className={styles.stamp}>{f.stamp}</span>
              <h2 className="type-bold">{f.title}</h2>
              <p className="type">{f.blurb}</p>
            </div>
            <Phone src={f.image} alt={f.alt} priority={i === 0} />
          </Reveal>
        ))}
      </section>

      <section className={styles.end}>
        <div className={`wrap ${styles.endInner}`}>
          <p className="type-bold">Ready to join the map?</p>
          <div className={styles.endCta}>
            <a
              href={SITE.appStoreUrl}
              className="store-badge"
              target="_blank"
              rel="noopener noreferrer"
            >
              <Image
                src="/figma/app-store-figma.png"
                alt="Download on the App Store"
                width={440}
                height={144}
              />
            </a>
            <Link href="/contact" className="btn btn-cream">
              Contact
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
