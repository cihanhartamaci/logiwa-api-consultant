import { useEffect } from 'react';
import { ExternalLink, HelpCircle, Key, X } from 'lucide-react';
import { GEMINI_LOCAL_REFERRER, GEMINI_SITE_REFERRER } from '../services/gemini';

export default function ApiKeyInstructionsModal({ open, onClose }) {
  useEffect(() => {
    if (!open) return undefined;

    const onKeyDown = (event) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      window.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="key-help-overlay" role="presentation" onClick={onClose}>
      <div
        className="key-help-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="key-help-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="key-help-header">
          <div className="key-help-heading">
            <HelpCircle size={18} />
            <h2 id="key-help-title">How to get API keys</h2>
          </div>
          <button type="button" className="key-help-close" onClick={onClose} aria-label="Close instructions">
            <X size={18} />
          </button>
        </div>

        <p className="key-help-intro">
          Keys stay in this browser only. Use Gemini for the full expert, or Pollinations as a free fallback.
        </p>

        <section className="key-help-section">
          <div className="key-help-section-title">
            <Key size={16} />
            <h3>Gemini API key</h3>
          </div>
          <ol className="key-help-steps">
            <li>
              Open{' '}
              <a href="https://aistudio.google.com/apikey" target="_blank" rel="noreferrer">
                Google AI Studio → API keys <ExternalLink size={12} />
              </a>
              .
            </li>
            <li>Sign in with your Google account and create a Generative Language API key.</li>
            <li>
              Under application restrictions, choose <strong>HTTP referrers (websites)</strong> and allow:
              <ul>
                <li>
                  <code>{GEMINI_SITE_REFERRER}</code>
                </li>
                <li>
                  <code>{GEMINI_LOCAL_REFERRER}</code> (local testing)
                </li>
              </ul>
              Google blocks unrestricted keys in the browser.
            </li>
            <li>Copy the key and paste it into the Gemini field in AIntegration. Connect is optional once the key is pasted.</li>
          </ol>
        </section>

        <section className="key-help-section">
          <div className="key-help-section-title">
            <Key size={16} />
            <h3>Pollinations API key</h3>
          </div>
          <ol className="key-help-steps">
            <li>
              Open{' '}
              <a href="https://enter.pollinations.ai" target="_blank" rel="noreferrer">
                enter.pollinations.ai <ExternalLink size={12} />
              </a>
              .
            </li>
            <li>Create a free account and generate an API key from the dashboard.</li>
            <li>Enable <strong>Pollinations fallback</strong> in AIntegration and paste the key into the Pollinations field.</li>
            <li>
              Pollinations no longer allows anonymous text calls, so a key is required. If Gemini hits quota (429), AIntegration
              switches here automatically when a key is present.
            </li>
          </ol>
        </section>

        <p className="key-help-footnote">
          Tip: You only need one provider to start. Gemini is recommended; Pollinations works alone as a shorter free fallback with
          the same Logiwa sources.
        </p>
      </div>
    </div>
  );
}
