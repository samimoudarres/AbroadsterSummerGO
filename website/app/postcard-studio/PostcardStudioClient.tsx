'use client';

import dynamic from 'next/dynamic';

const PostcardStudioApp = dynamic(
  () =>
    import('@/features/postcard-studio/PostcardStudioApp').then(
      (m) => m.PostcardStudioApp,
    ),
  {
    ssr: false,
    loading: () => (
      <div className="wrap" style={{ padding: '2rem 0' }}>
        <p className="type">Loading Postcard Studio…</p>
      </div>
    ),
  },
);

export function PostcardStudioClient() {
  return <PostcardStudioApp />;
}
