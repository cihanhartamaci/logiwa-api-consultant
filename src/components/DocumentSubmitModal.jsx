import { useRef, useState } from 'react';
import { CheckCircle, FilePlus, Paperclip, X } from 'lucide-react';
import { MAX_DOCUMENT_CHARS, submitBestPracticeDocument } from '../services/knowledgeBase';
import { canModerateKnowledge } from '../services/kbApi';

const ACCEPTED_EXTENSIONS = '.md,.markdown,.txt,.csv,.json,.yaml,.yml,.xml,.html,.htm';

function htmlToText(html) {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  doc.querySelectorAll('script, style, noscript').forEach((el) => el.remove());
  return (doc.body?.innerText || doc.body?.textContent || '').replace(/\n{3,}/g, '\n\n').trim();
}

function titleFromFilename(name) {
  return String(name || '')
    .replace(/\.[^.]+$/, '')
    .replace(/[_-]+/g, ' ')
    .trim();
}

export default function DocumentSubmitModal({ open, onClose, onSubmitted }) {
  const [title, setTitle] = useState('');
  const [url, setUrl] = useState('');
  const [content, setContent] = useState('');
  const [filename, setFilename] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);
  const fileRef = useRef(null);
  const isAdmin = canModerateKnowledge();

  if (!open) return null;

  const reset = () => {
    setTitle('');
    setUrl('');
    setContent('');
    setFilename(null);
    setError('');
    setResult(null);
    if (fileRef.current) fileRef.current.value = '';
  };

  const handleClose = () => {
    if (busy) return;
    reset();
    onClose?.();
  };

  const handleFile = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setError('');
    try {
      const raw = await file.text();
      const text = /\.html?$/i.test(file.name) ? htmlToText(raw) : raw;
      setContent(text);
      setFilename(file.name);
      if (!title.trim()) setTitle(titleFromFilename(file.name));
    } catch (err) {
      console.error(err);
      setError('Could not read that file. Paste the text instead.');
    }
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      const entry = await submitBestPracticeDocument({ title, content, url, filename });
      setResult(entry?.status === 'approved' ? 'approved' : 'pending');
      onSubmitted?.(entry);
    } catch (err) {
      console.error(err);
      setError(err?.message || 'Failed to submit document');
    } finally {
      setBusy(false);
    }
  };

  const tooLong = content.length > MAX_DOCUMENT_CHARS;

  return (
    <div className="modal-backdrop" role="presentation" onClick={handleClose}>
      <div
        className="modal-panel document-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="document-modal-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="knowledge-desk-header">
          <h2 id="document-modal-title">
            <FilePlus size={18} /> Add best-practice document
          </h2>
          <button type="button" className="icon-ghost-btn" onClick={handleClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>

        {result ? (
          <div className="document-result">
            <CheckCircle size={28} />
            <p>
              {result === 'approved'
                ? 'Added to the team knowledge base. AIntegration can cite it right away.'
                : 'Submitted. Integrationsteam will review it before it is used in answers.'}
            </p>
            <div className="modal-actions">
              <button type="button" className="reject-btn" onClick={reset}>
                Add another
              </button>
              <button type="button" className="approve-btn" onClick={handleClose}>
                Done
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            <p className="modal-lead">
              Share a Logiwa best-practice guide, runbook, or integration checklist.
              {isAdmin
                ? ' As integrationsteam, your document is approved immediately.'
                : ' It stays pending until integrationsteam approves it.'}
            </p>

            <label className="document-field">
              <span>Title</span>
              <input
                className="desk-edit-topic"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Shopify order sync best practices"
                maxLength={200}
                required
              />
            </label>

            <label className="document-field">
              <span>Reference link (optional)</span>
              <input
                className="desk-edit-topic"
                type="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://…"
              />
            </label>

            <div className="document-field">
              <span>Content</span>
              <div className="document-file-row">
                <button
                  type="button"
                  className="desk-export-btn"
                  onClick={() => fileRef.current?.click()}
                >
                  <Paperclip size={14} /> Upload text file
                </button>
                <span className="document-file-hint">
                  {filename || 'Markdown, TXT, CSV, JSON, YAML, XML, or HTML'}
                </span>
                <input
                  ref={fileRef}
                  type="file"
                  accept={ACCEPTED_EXTENSIONS}
                  onChange={handleFile}
                  hidden
                />
              </div>
              <textarea
                className="correction-input document-content"
                rows={12}
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="Paste the document text here, or upload a file above."
                required
              />
              <span className={`document-count ${tooLong ? 'over' : ''}`}>
                {content.length.toLocaleString('en-US')} / {MAX_DOCUMENT_CHARS.toLocaleString('en-US')} characters
              </span>
            </div>

            {error && <div className="desk-error">{error}</div>}

            <div className="modal-actions">
              <button type="button" className="reject-btn" onClick={handleClose} disabled={busy}>
                Cancel
              </button>
              <button
                type="submit"
                className="approve-btn"
                disabled={busy || !title.trim() || !content.trim() || tooLong}
              >
                {busy ? 'Submitting…' : isAdmin ? 'Add document' : 'Submit for approval'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
