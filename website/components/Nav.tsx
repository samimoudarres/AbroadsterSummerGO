'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { SITE } from '@/lib/site';
import styles from './Nav.module.css';

const links = [
  { href: '/features', label: 'How it works' },
  { href: '/#about', label: 'About' },
  { href: '/contact', label: 'Contact' },
];

export function Nav() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  return (
    <header className={styles.header}>
      <div className={`wrap ${styles.bar}`}>
        <Link href="/" className={styles.brand} aria-label="Abroadster home">
          <Image
            src="/figma/logo-header.png"
            alt="Abroadster"
            width={347}
            height={160}
            priority
            className={styles.logo}
          />
        </Link>

        <nav className={styles.pill} aria-label="Primary">
          {links.map((l) => {
            const active =
              l.href === '/features'
                ? pathname === '/features'
                : l.href === '/contact'
                  ? pathname === '/contact'
                  : false;
            return (
              <Link
                key={l.href}
                href={l.href}
                className={`${styles.link} ${active ? styles.active : ''}`}
              >
                {l.label}
              </Link>
            );
          })}
        </nav>

        <div className={styles.right}>
          <a
            href={SITE.appStoreUrl}
            className={`store-badge ${styles.badgeDesk}`}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Download on the App Store"
          >
            <Image
              src="/figma/app-store-figma.png"
              alt="Download on the App Store"
              width={440}
              height={144}
              className={styles.badgeImg}
            />
          </a>
          <button
            type="button"
            className={styles.menu}
            aria-expanded={open}
            aria-controls="mnav"
            onClick={() => setOpen((v) => !v)}
          >
            {open ? 'Close' : 'Menu'}
          </button>
        </div>
      </div>

      {open && (
        <div id="mnav" className={styles.mobile}>
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className={styles.mlink}
              onClick={() => setOpen(false)}
            >
              {l.label}
            </Link>
          ))}
          <a
            href={SITE.appStoreUrl}
            className={`store-badge ${styles.mbadge}`}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => setOpen(false)}
          >
            <Image
              src="/figma/app-store-figma.png"
              alt="Download on the App Store"
              width={440}
              height={144}
            />
          </a>
        </div>
      )}
    </header>
  );
}
