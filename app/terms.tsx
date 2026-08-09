import React from 'react';
import { LegalDocumentScreen } from '../components/legal/LegalDocumentScreen';

/** In-app Terms of Use page (also works on Expo web). */
export default function TermsRoute() {
  return <LegalDocumentScreen kind="terms" />;
}
