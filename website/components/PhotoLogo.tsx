import styles from './PhotoLogo.module.css';

/** Big photo-filled ABROADSTER wordmark for the postcard hero. */
export function PhotoLogo() {
  return (
    <div className={styles.wrap} aria-label="Abroadster">
      <span className={styles.word} aria-hidden>
        ABROADSTER
      </span>
      <span className={styles.waves} aria-hidden />
      <span className={styles.pin} aria-hidden />
    </div>
  );
}
