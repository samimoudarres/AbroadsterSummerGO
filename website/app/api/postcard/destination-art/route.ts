import { NextResponse } from 'next/server';
import { destinationCacheKey, normalizeDestination } from '@/features/postcard-studio/utils';

export const runtime = 'nodejs';

type Body = {
  destination?: string;
  countryCode?: string | null;
};

/**
 * Optional Recraft destination illustration.
 * Never receives user photos. Falls back quietly when disabled/unavailable.
 */
export async function POST(req: Request) {
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const destination = normalizeDestination(body.destination || '');
  if (!destination || destination.length > 48) {
    return NextResponse.json({ error: 'Invalid destination' }, { status: 400 });
  }

  const styleVersion = process.env.POSTCARD_STYLE_VERSION || 'v1';
  const cacheKey = destinationCacheKey(
    destination,
    body.countryCode,
    styleVersion,
  );

  const enabled =
    process.env.POSTCARD_AI_ENABLED === 'true' &&
    Boolean(process.env.RECRAFT_API_KEY);

  if (!enabled) {
    return NextResponse.json({
      cacheKey,
      source: 'fallback',
      url: null,
      message:
        'AI destination art is off. The studio uses built-in vintage illustration.',
    });
  }

  try {
    const styleId = process.env.RECRAFT_STYLE_ID;
    const prompt = [
      `Create an original, wordless panoramic travel illustration for ${destination}.`,
      'Distribute three to five local landscape and architectural motifs left to right.',
      'Mid-century travel-poster look: hand-inked outlines, screen-printed color separations,',
      'slightly imperfect registration, faded pigments, subtle paper grain.',
      'No words, letters, numbers, logos, watermarks, borders, photorealism, or identifiable people.',
    ].join(' ');

    const res = await fetch('https://external.api.recraft.ai/v1/images/generations', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.RECRAFT_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        prompt,
        style_id: styleId || undefined,
        size: '1820x1024',
      }),
      signal: AbortSignal.timeout(25000),
    });

    if (!res.ok) {
      return NextResponse.json({
        cacheKey,
        source: 'fallback',
        url: null,
        message: 'Destination art provider unavailable. Using built-in art.',
      });
    }

    const data = (await res.json()) as {
      data?: Array<{ url?: string }>;
    };
    const url = data.data?.[0]?.url;
    if (!url) {
      return NextResponse.json({
        cacheKey,
        source: 'fallback',
        url: null,
        message: 'No art returned. Using built-in art.',
      });
    }

    return NextResponse.json({
      cacheKey,
      source: 'recraft',
      url,
      message: 'Loaded destination illustration.',
    });
  } catch {
    return NextResponse.json({
      cacheKey,
      source: 'fallback',
      url: null,
      message: 'Destination art timed out. Using built-in art.',
    });
  }
}
