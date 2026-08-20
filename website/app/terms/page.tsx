import type { Metadata } from 'next';
import { LegalDoc } from '@/components/LegalDoc';
import {
  TERMS_OF_USE_EFFECTIVE,
  TERMS_OF_USE_SECTIONS,
  TERMS_OF_USE_TITLE,
} from '@/lib/legal/terms';

export const metadata: Metadata = {
  title: 'Terms of Use',
  description: 'Abroadster Terms of Use for the Abroadster mobile and web app.',
};

export default function TermsPage() {
  return (
    <LegalDoc
      title={TERMS_OF_USE_TITLE}
      effective={TERMS_OF_USE_EFFECTIVE}
      sections={TERMS_OF_USE_SECTIONS}
      otherHref="/privacy"
      otherLabel="Privacy Policy"
    />
  );
}
