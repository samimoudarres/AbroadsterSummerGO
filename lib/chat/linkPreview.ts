export type LinkPreviewData = {
  url: string;
  title?: string;
  description?: string;
  imageUrl?: string;
  siteName?: string;
};

const URL_RE =
  /https?:\/\/[^\s<>"']+/gi;

const previewCache = new Map<string, LinkPreviewData | null>();

export function extractFirstUrl(text: string): string | null {
  const match = text.match(URL_RE);
  if (!match?.[0]) return null;
  return match[0].replace(/[)\].,!?]+$/, '');
}

function youtubeId(url: string): string | null {
  try {
    const u = new URL(url);
    if (u.hostname.includes('youtu.be')) {
      return u.pathname.slice(1) || null;
    }
    if (u.hostname.includes('youtube.com')) {
      return u.searchParams.get('v');
    }
  } catch {
    return null;
  }
  return null;
}

function tiktokUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return host.includes('tiktok.com') || host.includes('vm.tiktok.com');
  } catch {
    return false;
  }
}

async function fetchJson<T>(endpoint: string): Promise<T | null> {
  try {
    const res = await fetch(endpoint);
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

async function previewYouTube(url: string): Promise<LinkPreviewData | null> {
  const id = youtubeId(url);
  if (!id) return null;
  const data = await fetchJson<{
    title?: string;
    author_name?: string;
    thumbnail_url?: string;
  }>(`https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`);
  if (!data) return null;
  return {
    url,
    title: data.title,
    siteName: data.author_name ?? 'YouTube',
    imageUrl: data.thumbnail_url ?? `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
  };
}

async function previewTikTok(url: string): Promise<LinkPreviewData | null> {
  const data = await fetchJson<{
    title?: string;
    author_name?: string;
    thumbnail_url?: string;
  }>(`https://www.tiktok.com/oembed?url=${encodeURIComponent(url)}`);
  if (!data) return null;
  return {
    url,
    title: data.title,
    siteName: data.author_name ?? 'TikTok',
    imageUrl: data.thumbnail_url,
  };
}

function parseOg(html: string, property: string): string | undefined {
  const re = new RegExp(
    `<meta[^>]+property=["']${property}["'][^>]+content=["']([^"']+)["']`,
    'i',
  );
  const m = html.match(re);
  if (m?.[1]) return m[1];
  const re2 = new RegExp(
    `<meta[^>]+content=["']([^"']+)["'][^>]+property=["']${property}["']`,
    'i',
  );
  return re2.exec(html)?.[1];
}

async function previewOpenGraph(url: string): Promise<LinkPreviewData | null> {
  try {
    const res = await fetch(url, {
      headers: { Accept: 'text/html' },
    });
    if (!res.ok) return null;
    const html = (await res.text()).slice(0, 120_000);
    const title =
      parseOg(html, 'og:title') ??
      html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1]?.trim();
    const imageUrl = parseOg(html, 'og:image');
    const description = parseOg(html, 'og:description');
    const siteName = parseOg(html, 'og:site_name');
    if (!title && !imageUrl && !description) return null;
    return { url, title, description, imageUrl, siteName };
  } catch {
    return null;
  }
}

export async function fetchLinkPreview(url: string): Promise<LinkPreviewData | null> {
  const cached = previewCache.get(url);
  if (cached !== undefined) return cached;

  let preview: LinkPreviewData | null = null;
  const lower = url.toLowerCase();

  if (lower.includes('youtube.com') || lower.includes('youtu.be')) {
    preview = await previewYouTube(url);
  } else if (tiktokUrl(url)) {
    preview = await previewTikTok(url);
  }

  if (!preview) {
    preview = await previewOpenGraph(url);
  }

  if (!preview) {
    try {
      preview = { url, title: new URL(url).hostname.replace(/^www\./, '') };
    } catch {
      preview = { url, title: url };
    }
  }

  previewCache.set(url, preview);
  return preview;
}

export function clearLinkPreviewCache() {
  previewCache.clear();
}
