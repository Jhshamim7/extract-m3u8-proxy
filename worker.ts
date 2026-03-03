export default {
  async fetch(request: Request, env: any, ctx: any): Promise<Response> {
    const url = new URL(request.url);
    
    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, OPTIONS',
          'Access-Control-Allow-Headers': '*',
          'Access-Control-Max-Age': '86400',
        },
      });
    }

    if (url.pathname === '/proxy') {
      const targetUrlStr = url.searchParams.get('url');
      if (!targetUrlStr) {
        return new Response('Missing url parameter', { status: 400 });
      }

      try {
        const targetUrl = new URL(targetUrlStr);
        const headers = new Headers();
        
        // Inject the required headers for the target stream
        headers.set('Referer', 'https://streamindia.co.in/');
        headers.set('User-Agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

        const response = await fetch(targetUrl.toString(), {
          headers: headers,
          redirect: 'follow'
        });

        const contentType = response.headers.get('content-type') || '';
        const isM3u8 = targetUrlStr.includes('.m3u8') || contentType.includes('mpegurl') || contentType.includes('application/x-mpegURL');

        const newHeaders = new Headers(response.headers);
        newHeaders.set('Access-Control-Allow-Origin', '*');
        newHeaders.set('Access-Control-Allow-Methods', 'GET, OPTIONS');
        newHeaders.set('Access-Control-Allow-Headers', '*');

        if (isM3u8) {
          // We need to rewrite the playlist content
          let content = await response.text();
          const lines = content.split('\n');
          const rewrittenLines = lines.map(line => {
            const trimmed = line.trim();
            
            // If it's a URI line (not empty and doesn't start with #)
            if (trimmed && !trimmed.startsWith('#')) {
              try {
                const absoluteUrl = new URL(trimmed, targetUrl.toString()).href;
                return `${url.origin}/proxy?url=${encodeURIComponent(absoluteUrl)}`;
              } catch (e) {
                return line;
              }
            }
            
            // If it's an EXT tag that might contain a URI (like #EXT-X-KEY or #EXT-X-MEDIA)
            if (trimmed.startsWith('#EXT')) {
              return trimmed.replace(/URI="([^"]+)"/g, (match, uri) => {
                try {
                  if (uri.startsWith('data:')) return match;
                  const absoluteUrl = new URL(uri, targetUrl.toString()).href;
                  return `URI="${url.origin}/proxy?url=${encodeURIComponent(absoluteUrl)}"`;
                } catch (e) {
                  return match;
                }
              });
            }
            return line;
          });
          
          // Playlists should not be cached
          newHeaders.set('Cache-Control', 'no-cache, no-store, must-revalidate');
          
          return new Response(rewrittenLines.join('\n'), {
            status: response.status,
            headers: newHeaders
          });
        } else {
          // For video segments (.ts), we stream the body directly for performance
          // and set aggressive caching headers
          newHeaders.set('Cache-Control', 'public, max-age=31536000, immutable');
          
          return new Response(response.body, {
            status: response.status,
            headers: newHeaders
          });
        }
      } catch (e: any) {
        return new Response(`Proxy error: ${e.message}`, { 
          status: 500,
          headers: { 'Access-Control-Allow-Origin': '*' }
        });
      }
    }

    // Simple landing page if they hit the root
    if (url.pathname === '/') {
      return new Response(`
        <html>
          <body style="font-family: sans-serif; padding: 2rem;">
            <h1>HLS Proxy Worker</h1>
            <p>Usage: <code>/proxy?url=YOUR_M3U8_URL</code></p>
          </body>
        </html>
      `, {
        headers: { 'Content-Type': 'text/html' }
      });
    }

    return new Response('Not Found', { status: 404 });
  }
};
