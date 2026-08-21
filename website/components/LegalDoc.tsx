import styles from './legal.module.css';

type Section = { heading: string; body: string };

export function LegalDoc({
  title,
  effective,
  sections,
  otherHref,
  otherLabel,
}: {
  title: string;
  effective: string;
  sections: Section[];
  otherHref: string;
  otherLabel: string;
}) {
  return (
    <article className={`wrap ${styles.doc}`}>
      <p className={styles.eyebrow}>Abroadster · Legal</p>
      <h1 className={styles.title}>{title}</h1>
      <p className={styles.meta}>
        Effective / Last updated: {effective}
        {' · '}
        <a href={otherHref}>{otherLabel}</a>
      </p>
      {sections.map((s) => (
        <section key={s.heading} className={styles.section}>
          <h2>{s.heading}</h2>
          <p>{s.body}</p>
        </section>
      ))}
    </article>
  );
}
