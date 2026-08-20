'use client';

import Image from 'next/image';
import { motion, useReducedMotion } from 'framer-motion';
import styles from './Phone.module.css';

type Props = {
  src: string;
  alt: string;
  priority?: boolean;
  className?: string;
};

export function Phone({ src, alt, priority, className }: Props) {
  const reduce = useReducedMotion();
  const img = (
    <Image
      src={src}
      alt={alt}
      width={720}
      height={1480}
      priority={priority}
      className={styles.img}
      sizes="(max-width: 768px) 85vw, 360px"
    />
  );

  if (reduce) {
    return <div className={`${styles.wrap} ${className ?? ''}`}>{img}</div>;
  }

  return (
    <motion.div
      className={`${styles.wrap} ${className ?? ''}`}
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-8% 0px' }}
      transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
    >
      {img}
    </motion.div>
  );
}
