import type { Metadata } from 'next';
import { PostcardStudioClient } from './PostcardStudioClient';

export const metadata: Metadata = {
  title: 'Postcard Studio',
  description:
    'Turn your study-abroad photos into a vintage large-letter postcard. Edit the collage in your browser and export a 1080×1920 story image. Personal photos stay on your device.',
  openGraph: {
    title: 'Postcard Studio · Abroadster',
    description:
      'Make a mid-century style travel postcard from your own photos. No AI edits to your faces or pictures.',
  },
};

export default function PostcardStudioPage() {
  const enabled =
    process.env.NEXT_PUBLIC_POSTCARD_STUDIO_ENABLED !== 'false';

  if (!enabled) {
    return (
      <div className="wrap" style={{ padding: '3rem 0' }}>
        <h1 className="type-bold">Postcard Studio</h1>
        <p className="type">
          This page is temporarily unavailable. Check back soon.
        </p>
      </div>
    );
  }

  return <PostcardStudioClient />;
}
