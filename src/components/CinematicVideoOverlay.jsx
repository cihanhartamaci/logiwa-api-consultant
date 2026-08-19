import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

export const LOGIN_CINEMATIC_VIDEO_ID = 'Uo0vHUbRsDE';
export const LOGOUT_CINEMATIC_VIDEO_ID = '_ZnOfdpOEZQ';

function loadYouTubeApi() {
  if (window.YT?.Player) return Promise.resolve(window.YT);
  if (window.__ytApiPromise) return window.__ytApiPromise;

  window.__ytApiPromise = new Promise((resolve) => {
    const previous = window.onYouTubeIFrameAPIReady;
    window.onYouTubeIFrameAPIReady = () => {
      previous?.();
      resolve(window.YT);
    };
    if (!document.querySelector('script[src="https://www.youtube.com/iframe_api"]')) {
      const script = document.createElement('script');
      script.src = 'https://www.youtube.com/iframe_api';
      script.async = true;
      document.body.appendChild(script);
    }
  });

  return window.__ytApiPromise;
}

export default function CinematicVideoOverlay({ videoId, mode = 'login', onFinished }) {
  const hostRef = useRef(null);
  const playerRef = useRef(null);
  const finishedRef = useRef(false);
  const onFinishedRef = useRef(onFinished);

  useEffect(() => {
    onFinishedRef.current = onFinished;
  }, [onFinished]);

  const finish = () => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    onFinishedRef.current?.();
  };

  useEffect(() => {
    finishedRef.current = false;
    let cancelled = false;
    const fallbackMs = mode === 'logout' ? 40000 : 75000;
    const fallback = window.setTimeout(finish, fallbackMs);

    loadYouTubeApi().then((YT) => {
      if (cancelled || !hostRef.current) return;
      playerRef.current = new YT.Player(hostRef.current, {
        videoId,
        width: '100%',
        height: '100%',
        playerVars: {
          autoplay: 1,
          rel: 0,
          modestbranding: 1,
          playsinline: 1,
          origin: window.location.origin,
        },
        events: {
          onReady: (event) => {
            try {
              event.target.unMute();
              event.target.playVideo();
            } catch {
              // Autoplay with sound can still be blocked; the iframe remains visible.
            }
          },
          onStateChange: (event) => {
            if (event.data === YT.PlayerState.ENDED) finish();
          },
        },
      });
    });

    return () => {
      cancelled = true;
      window.clearTimeout(fallback);
      try {
        playerRef.current?.destroy();
      } catch {
        // Player may already be gone.
      }
      playerRef.current = null;
    };
  }, [videoId, mode]);

  const isLogout = mode === 'logout';

  const overlay = (
    <div className={`cinematic-overlay ${isLogout ? 'cinematic-logout' : 'cinematic-login'}`} role="dialog" aria-modal="true">
      <div className="cinematic-scanlines" aria-hidden="true" />
      <div className="cinematic-vignette" aria-hidden="true" />
      <p className="cinematic-kicker">{isLogout ? 'Signing off' : 'Autobots, roll out'}</p>
      <div className="cinematic-stage">
        <div className="cinematic-frame">
          <div ref={hostRef} className="cinematic-player" />
        </div>
      </div>
      <p className="cinematic-caption">
        {isLogout ? "Don't let me leave…" : 'Optimus Prime is bringing you online.'}
      </p>
      <button type="button" className="cinematic-skip" onClick={finish}>
        Skip
      </button>
    </div>
  );

  return createPortal(overlay, document.body);
}
