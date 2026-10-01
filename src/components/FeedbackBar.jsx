import { useState } from 'react';
import { ThumbsUp, ThumbsDown } from 'lucide-react';

export default function FeedbackBar({ rating = null, disabled = false, onUp, onDown }) {
  return (
    <div className="feedback-bar" role="group" aria-label="Answer feedback">
      <button
        type="button"
        className={`feedback-btn ${rating === 'up' ? 'active up' : ''}`}
        onClick={onUp}
        disabled={disabled || rating != null}
        title="Helpful"
        aria-label="Mark answer helpful"
      >
        <ThumbsUp size={15} />
      </button>
      <button
        type="button"
        className={`feedback-btn ${rating === 'down' ? 'active down' : ''}`}
        onClick={onDown}
        disabled={disabled || rating != null}
        title="Needs correction"
        aria-label="Mark answer needs correction"
      >
        <ThumbsDown size={15} />
      </button>
    </div>
  );
}

export function CorrectionModal({ open, onClose, onSubmit, busy = false }) {
  const [text, setText] = useState('');
  if (!open) return null;

  const handleSubmit = (e) => {
    e.preventDefault();
    const trimmed = text.trim();
    if (!trimmed || busy) return;
    onSubmit(trimmed);
  };

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="modal-panel correction-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="correction-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="correction-title">What should we learn?</h2>
        <p className="modal-lead">
          Describe what was wrong and the correct Logiwa guidance. Support feedback stays pending
          until integrationsteam approves it into the shared knowledge base.
        </p>
        <form onSubmit={handleSubmit}>
          <textarea
            className="correction-input"
            rows={5}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Correct answer or rule…"
            autoFocus
          />
          <div className="modal-actions">
            <button type="button" className="reject-btn" onClick={onClose} disabled={busy}>
              Cancel
            </button>
            <button type="submit" className="approve-btn" disabled={!text.trim() || busy}>
              {busy ? 'Saving…' : 'Submit correction'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
