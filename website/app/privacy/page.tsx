import type { Metadata } from 'next';
import { LegalDoc } from '@/components/LegalDoc';
import {
  PRIVACY_POLICY_EFFECTIVE,
  PRIVACY_POLICY_SECTIONS,
  PRIVACY_POLICY_TITLE,
} from '@/lib/legal/privacy';

export const metadata: Metadata = {
  title: 'Privacy Policy',
  description:
    'Abroadster Privacy Policy — how we collect, use, and protect your information.',
};

export default function PrivacyPage() {
  return (
    <LegalDoc
      title={PRIVACY_POLICY_TITLE}
      effective={PRIVACY_POLICY_EFFECTIVE}
      sections={PRIVACY_POLICY_SECTIONS}
      otherHref="/terms"
      otherLabel="Terms of Use"
    />
  );
}
