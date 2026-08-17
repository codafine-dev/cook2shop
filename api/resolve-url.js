// Resolves Google short links (share.google, search.app) to their final
// canonical URL. These links require following an HTTP redirect chain that
// AI chat tools cannot do themselves when given the short link directly —
// they just report they can't access the page. This runs server-side
// (Vercel serverless function) to avoid browser CORS restrictions on
// reading a cross-origin redirect's final URL.

export default async function handler(req, res) {
  const { url } = req.query;

  if (!url) {
    return res.status(400).json({ error: 'Missing url parameter' });
  }

  try {
    const target = new URL(url);
    const isGoogleShortLink =
      target.hostname === 'share.google' || target.hostname === 'search.app';

    if (!isGoogleShortLink) {
      // Nothing to resolve, hand it back as-is.
      return res.status(200).json({ resolvedUrl: url });
    }

    const response = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      headers: {
        // Some redirect chains behave differently for bot-like UAs; a
        // normal browser UA gets the same result users see themselves.
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
    });

    return res.status(200).json({ resolvedUrl: response.url || url });
  } catch (error) {
    console.error('resolve-url error:', error);
    // Fail soft: return the original URL so the caller can still try it
    // rather than blocking the whole flow.
    return res.status(200).json({ resolvedUrl: url, resolved: false });
  }
}
