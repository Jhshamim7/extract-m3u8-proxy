import express from "express";
import { createServer as createViteServer } from "vite";
import axios from "axios";
import http from "http";
import https from "https";

// Create reusable agents with Keep-Alive enabled to drastically reduce connection latency
const httpAgent = new http.Agent({ keepAlive: true, maxSockets: 100, keepAliveMsecs: 3000 });
const httpsAgent = new https.Agent({ keepAlive: true, maxSockets: 100, keepAliveMsecs: 3000 });

async function startServer() {
  const app = express();
  const PORT = 3000;

  // CORS Proxy Route for HLS streams
  app.get("/proxy", async (req, res) => {
    const targetUrl = req.query.url as string;
    
    if (!targetUrl) {
      return res.status(400).send("Missing url query parameter");
    }

    try {
      const response = await axios({
        method: "GET",
        url: targetUrl,
        responseType: "stream",
        httpAgent,
        httpsAgent,
        timeout: 15000, // Prevent hung requests
        headers: {
          "Referer": "https://streamindia.co.in/",
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          "Accept-Encoding": "gzip, deflate, br", // Request compressed data to save bandwidth
        },
      });

      // Set CORS headers
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");

      // Forward Content-Type if available
      const contentType = response.headers["content-type"];
      if (contentType) {
        res.setHeader("Content-Type", contentType);
      }

      const isM3u8 = targetUrl.includes('.m3u8') || (contentType && contentType.includes('mpegurl'));

      if (isM3u8) {
        // Prevent caching of playlists so live streams update correctly
        res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
        let m3u8Content = '';
        response.data.on('data', (chunk: Buffer) => {
          m3u8Content += chunk.toString('utf-8');
        });
        response.data.on('end', () => {
          const lines = m3u8Content.split('\n');
          const rewrittenLines = lines.map(line => {
            const trimmed = line.trim();
            // If it's a URI line (not empty and doesn't start with #)
            if (trimmed && !trimmed.startsWith('#')) {
              try {
                const absoluteUrl = new URL(trimmed, targetUrl).href;
                return `/proxy?url=${encodeURIComponent(absoluteUrl)}`;
              } catch (e) {
                return line;
              }
            }
            // If it's an EXT tag that might contain a URI
            if (trimmed.startsWith('#EXT')) {
              return trimmed.replace(/URI="([^"]+)"/g, (match, uri) => {
                try {
                  if (uri.startsWith('data:')) return match;
                  const absoluteUrl = new URL(uri, targetUrl).href;
                  return `URI="/proxy?url=${encodeURIComponent(absoluteUrl)}"`;
                } catch (e) {
                  return match;
                }
              });
            }
            return line;
          });
          res.send(rewrittenLines.join('\n'));
        });
      } else {
        // Cache video segments (.ts files) aggressively in the browser
        res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
        
        // Forward Content-Length if available for non-m3u8 files
        if (response.headers["content-length"]) {
          res.setHeader("Content-Length", response.headers["content-length"]);
        }
        // Pipe the stream to the response
        response.data.pipe(res);
      }
    } catch (error: any) {
      console.error("Proxy error:", error.message);
      res.status(500).send("Error proxying request");
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    // Serve static files in production
    app.use(express.static("dist"));
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
