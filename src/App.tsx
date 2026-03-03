import { useEffect, useRef, useState } from 'react';
import Hls from 'hls.js';

export default function App() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const [streamUrl, setStreamUrl] = useState('');
  const [isPlaying, setIsPlaying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (hlsRef.current) {
        hlsRef.current.destroy();
      }
    };
  }, []);

  const handlePlay = () => {
    if (!streamUrl || !videoRef.current) return;
    setError(null);

    // Clean up previous instance
    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }

    // Reset video state
    videoRef.current.pause();
    videoRef.current.removeAttribute('src');
    videoRef.current.load();

    // Use our proxy endpoint
    const proxyUrl = `/proxy?url=${encodeURIComponent(streamUrl)}`;

    if (Hls.isSupported()) {
      const hls = new Hls({
        debug: false,
      });
      hlsRef.current = hls;
      
      hls.loadSource(proxyUrl);
      hls.attachMedia(videoRef.current);
      
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        setIsPlaying(true);
        // Add a small delay to ensure media is ready to play
        setTimeout(() => {
          const playPromise = videoRef.current?.play();
          if (playPromise !== undefined) {
            playPromise.catch(e => {
              if (e.name !== 'AbortError') {
                console.error("Playback failed", e);
                setError("Playback failed. Please try again.");
              }
            });
          }
        }, 100);
      });

      hls.on(Hls.Events.ERROR, (event, data) => {
        if (data.fatal) {
          switch (data.type) {
            case Hls.ErrorTypes.NETWORK_ERROR:
              setError("Network error encountered while loading the stream.");
              hls.startLoad();
              break;
            case Hls.ErrorTypes.MEDIA_ERROR:
              setError("Media error encountered. Trying to recover...");
              hls.recoverMediaError();
              break;
            default:
              setError("An unrecoverable error occurred.");
              hls.destroy();
              break;
          }
        }
      });
    } else if (videoRef.current.canPlayType('application/vnd.apple.mpegurl')) {
      // For Safari
      videoRef.current.src = proxyUrl;
      videoRef.current.addEventListener('loadedmetadata', () => {
        setIsPlaying(true);
        const playPromise = videoRef.current?.play();
        if (playPromise !== undefined) {
          playPromise.catch(e => {
            if (e.name !== 'AbortError') {
              console.error("Playback failed", e);
              setError("Playback failed. Please try again.");
            }
          });
        }
      });
      
      videoRef.current.addEventListener('error', () => {
        setError("Error loading the stream.");
      });
    } else {
      setError("HLS is not supported in your browser.");
    }
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-white p-8 font-sans">
      <div className="max-w-4xl mx-auto space-y-8">
        <div className="space-y-2">
          <h1 className="text-3xl font-bold tracking-tight">HLS Stream Proxy</h1>
          <p className="text-zinc-400">
            Enter an HLS stream URL (.m3u8) to play it through the CORS proxy.
          </p>
        </div>

        <div className="flex gap-4">
          <input
            type="text"
            value={streamUrl}
            onChange={(e) => setStreamUrl(e.target.value)}
            placeholder="https://example.com/stream.m3u8"
            className="flex-1 bg-zinc-900 border border-zinc-800 rounded-lg px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          <button
            onClick={handlePlay}
            className="bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-2 rounded-lg font-medium transition-colors"
          >
            Play Stream
          </button>
        </div>

        {error && (
          <div className="bg-red-900/50 border border-red-500/50 text-red-200 px-4 py-3 rounded-lg">
            {error}
          </div>
        )}

        <div className="aspect-video bg-black rounded-xl overflow-hidden border border-zinc-800 shadow-2xl relative">
          {!isPlaying && !error && (
            <div className="absolute inset-0 flex items-center justify-center text-zinc-600">
              No stream loaded
            </div>
          )}
          <video
            ref={videoRef}
            controls
            className="w-full h-full"
          />
        </div>
      </div>
    </div>
  );
}
