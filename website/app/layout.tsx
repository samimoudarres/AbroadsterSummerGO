import type { Metadata } from 'next';
import { Courier_Prime } from 'next/font/google';
import { headers } from 'next/headers';
import { Analytics } from '@vercel/analytics/next';
import { SiteShell } from '@/components/SiteShell';
import { SITE } from '@/lib/site';
import './globals.css';

const courier = Courier_Prime({
  weight: ['400', '700'],
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-courier',
});

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SITE_URL || 'https://abroadster.vercel.app'
  ),
  title: {
    default: `${SITE.name} · ${SITE.tagline}`,
    template: `%s · ${SITE.name}`,
  },
  description:
    'Abroadster is the social map for students studying abroad. Find classmates nearby, plan trips, share albums, and stay in touch.',
  openGraph: {
    title: `${SITE.name} · ${SITE.tagline}`,
    description: 'See where everyone’s traveling and join the adventure.',
    type: 'website',
    images: [{ url: '/figma/logo-filled.png' }],
  },
  icons: {
    icon: [
      { url: '/favicon.ico', sizes: 'any' },
      { url: '/favicon-32.png', sizes: '32x32', type: 'image/png' },
      { url: '/favicon.png', sizes: '48x48', type: 'image/png' },
    ],
    apple: [{ url: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' }],
  },
};

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const headerList = await headers();
  const isAdminRoute = headerList.get('x-admin-route') === '1';

  return (
    <html lang="en" className={courier.variable}>
      <body className={courier.className}>
        {isAdminRoute ? children : <SiteShell>{children}</SiteShell>}
        {!isAdminRoute ? <Analytics /> : null}
      </body>
    </html>
  );
}
