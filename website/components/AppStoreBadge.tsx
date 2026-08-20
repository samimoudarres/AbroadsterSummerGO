import { SITE } from '@/lib/site';
import styles from './AppStoreBadge.module.css';

type Props = {
  height?: number;
  className?: string;
};

/** Official App Store badge linking to Abroadster. */
export function AppStoreBadge({ height = 44, className }: Props) {
  const width = Math.round(height * (120 / 40));
  return (
    <a
      href={SITE.appStoreUrl}
      className={`${styles.badge} ${className ?? ''}`}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Download Abroadster on the App Store"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/app-store-badge.svg"
        alt="Download on the App Store"
        width={width}
        height={height}
        className={styles.img}
      />
    </a>
  );
}
