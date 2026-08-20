import Image from 'next/image';
import Link from 'next/link';
import { Phone } from '@/components/Phone';
import { Reveal } from '@/components/Reveal';
import { FEATURES, SITE } from '@/lib/site';
import styles from './home.module.css';

export default function HomePage() {
  return (
    <>
      {/* Landing hero locked to Figma Desktop frame proportions */}
      <section className={styles.hero} data-figma="187:124-hero">
        <div className={styles.heroFrame}>
          <Image
            src="/figma/stamp.png"
            alt=""
            width={136}
            height={136}
            className={styles.postage}
            aria-hidden
            priority
          />
          <p className={`type ${styles.with}`}>Study Abroad With</p>
          <div className={styles.logoWrap}>
            <Image
              src="/figma/logo-filled.png"
              alt="Abroadster"
              width={950}
              height={263}
              className={styles.filledLogo}
              priority
            />
          </div>
          <h1 className={`type-bold ${styles.tagline}`}>
            See where everyone’s traveling and join the adventure
          </h1>
        </div>
      </section>

      <section id="about" className={styles.about}>
        <div className={`wrap ${styles.aboutGrid}`}>
          <div className={styles.phoneWrap}>
            <Image
              src="/figma/phone-map-hero.png"
              alt="Abroadster map showing friends and programs in Paris"
              width={495}
              height={371}
              className={styles.heroPhone}
              priority
            />
          </div>
          <div className={styles.aboutCopy}>
            <p className="type">
              Abroadster is the social map for students studying abroad.
              Classmates nearby, weekend trips, school chats, and photos you
              actually want to keep.
            </p>
            <div className={styles.aboutCta}>
              <a
                href={SITE.appStoreUrl}
                className="store-badge"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Download on the App Store"
              >
                <Image
                  src="/figma/app-store-figma.png"
                  alt="Download on the App Store"
                  width={440}
                  height={144}
                />
              </a>
              <Link href="/features" className="btn btn-cream">
                How it works
              </Link>
            </div>
          </div>
        </div>
      </section>

      <section className={`wrap ${styles.beats}`} id="how-it-works">
        {FEATURES.map((f, i) => (
          <Reveal
            key={f.slug}
            className={`${styles.beat} ${i % 2 === 1 ? styles.flip : ''}`}
            id={f.slug}
          >
            <div className={styles.copy}>
              <span className={styles.stampLabel}>{f.stamp}</span>
              <h2 className="type-bold">{f.title}</h2>
              <p className="type">{f.blurb}</p>
            </div>
            <Phone src={f.image} alt={f.alt} priority={i < 2} />
          </Reveal>
        ))}
      </section>

      <section className={styles.close}>
        <div className={`wrap ${styles.closeInner}`}>
          <p className="type-bold">Ready when you are</p>
          <p className="type">
            Download Abroadster and see who’s already in your city.
          </p>
          <a
            href={SITE.appStoreUrl}
            className="store-badge"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Download on the App Store"
          >
            <Image
              src="/figma/app-store-figma.png"
              alt="Download on the App Store"
              width={440}
              height={144}
            />
          </a>
        </div>
      </section>
    </>
  );
}
