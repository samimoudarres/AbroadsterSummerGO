import Link from 'next/link';
import Image from 'next/image';
import { SITE } from '@/lib/site';
import styles from './Footer.module.css';

export function Footer() {
  const year = new Date().getFullYear();
  return (
    <footer className={styles.footer}>
      <div className={`wrap ${styles.inner}`}>
        <div className={styles.brand}>
          <Image
            src="/figma/logo-header.png"
            alt="Abroadster"
            width={200}
            height={64}
            className={styles.logo}
          />
          <p className="type">{SITE.tagline}</p>
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
        <div className={styles.cols}>
          <div>
            <h3 className="type-bold">Explore</h3>
            <Link href="/">Home</Link>
            <Link href="/features">How it works</Link>
            <Link href="/#about">About</Link>
            <Link href="/contact">Contact</Link>
          </div>
          <div>
            <h3 className="type-bold">Legal</h3>
            <Link href="/privacy">Privacy</Link>
            <Link href="/terms">Terms</Link>
            <Link href="/delete-account">Delete account</Link>
            <Link href="/support">Support</Link>
          </div>
          <div>
            <h3 className="type-bold">Say hello</h3>
            <Link href="/support">Support</Link>
            <Link href="/contact">Contact form</Link>
          </div>
        </div>
      </div>
      <div className={styles.copy}>
        <div className="wrap">© {year} Abroadster</div>
      </div>
    </footer>
  );
}
