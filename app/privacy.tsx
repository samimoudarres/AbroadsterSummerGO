import React from 'react';
import { LegalDocumentScreen } from '../components/legal/LegalDocumentScreen';

/** In-app Privacy Policy page (also works on Expo web). */
export default function PrivacyRoute() {
  return <LegalDocumentScreen kind="privacy" />;
}
