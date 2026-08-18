import { useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { closeOpenFences, nextTypewriterAdvance, prefersReducedMotion } from './typewriterUtils';

export default function TypewriterMarkdown({ content = '', animate = false, onUpdate, onComplete }) {
  const [shown, setShown] = useState('');
  const timerRef = useRef(null);
  const indexRef = useRef(0);
  const contentRef = useRef(content);
  const onUpdateRef = useRef(onUpdate);
  const onCompleteRef = useRef(onComplete);

  const shouldAnimate = Boolean(animate) && !prefersReducedMotion();
  const display = shouldAnimate ? shown : content;
  const running = shouldAnimate && shown.length < content.length;

  useEffect(() => {
    contentRef.current = content;
    onUpdateRef.current = onUpdate;
    onCompleteRef.current = onComplete;
  }, [content, onUpdate, onComplete]);

  useEffect(() => {
    if (!shouldAnimate) return undefined;

    indexRef.current = 0;
    const tick = () => {
      const full = contentRef.current;
      let i = indexRef.current;
      if (i >= full.length) {
        onCompleteRef.current?.();
        return;
      }

      const take = Math.max(1, nextTypewriterAdvance(full, i));
      i = Math.min(full.length, i + take);
      indexRef.current = i;
      setShown(full.slice(0, i));
      onUpdateRef.current?.();

      const pause = full[i - 1] === '\n' ? 26 : 12;
      timerRef.current = setTimeout(tick, pause);
    };

    timerRef.current = setTimeout(tick, 16);
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [shouldAnimate, content]);

  const finish = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    onCompleteRef.current?.();
  };

  return (
    <div
      className="typewriter-output"
      onClick={running ? finish : undefined}
      title={running ? 'Click to show the full answer' : undefined}
    >
      <div className="markdown-body">
        <ReactMarkdown>{closeOpenFences(display)}</ReactMarkdown>
      </div>
      {running && <span className="typing-caret" aria-hidden="true" />}
    </div>
  );
}
