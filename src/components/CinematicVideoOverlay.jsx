import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

export const LOGIN_CINEMATIC_VIDEO_ID = 'yVhbKYfPRck';
export const LOGOUT_CINEMATIC_VIDEO_ID = '_ZnOfdpOEZQ';

function youtubeEmbedSrc(videoId) {
  const params = new URLSearchParams({
    autoplay: '1',
    mute: '1',
    rel: '0',
    modestbranding: '1',
    playsinline: '1',
    enablejsapi: '1',
  });
  return `https://www.youtube.com/embed/${videoId}?${params.toString()}`;
}

export default function CinematicVideoOverlay({ videoId, mode = 'login', onFinished }) {
  const iframeRef = useRef(null);
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
    const fallbackMs = mode === 'logout' ? 40000 : 75000;
    const fallback = window.setTimeout(finish, fallbackMs);

    const onMessage = (event) => {
      if (!String(event.origin || '').includes('youtube.com')) return;
      let data = event.data;
      if (typeof data === 'string') {
        try {
          data = JSON.parse(data);
        } catch {
          return;
        }
      }
      if (data?.event === 'onStateChange' && data?.info === 0) {
        finish();
      }
    };

    window.addEventListener('message', onMessage);
    return () => {
      window.clearTimeout(fallback);
      window.removeEventListener('message', onMessage);
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
          <iframe
            ref={iframeRef}
            className="cinematic-player"
            src={youtubeEmbedSrc(videoId)}
            title={isLogout ? 'Logout cinematic' : 'Login cinematic'}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowFullScreen
            referrerPolicy="strict-origin-when-cross-origin"
          />
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
