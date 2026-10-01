import { useMemo, useState } from 'react';
import { BookMarked, CheckCircle, Download, Pencil, Trash2, X } from 'lucide-react';
import {
  approveKnowledge,
  deleteKnowledge,
  exportKnowledgeJson,
  getKnowledgeDeskEntries,
  isSharedKnowledgeEnabled,
  rejectKnowledge,
  updateKnowledge,
} from '../services/knowledgeBase';
import { canModerateKnowledge, getSessionRole, getSessionUsername } from '../services/kbApi';

const FILTERS = [
  { id: 'pending', label: 'Pending' },
  { id: 'approved', label: 'Approved' },
  { id: 'rejected', label: 'Rejected' },
  { id: 'all', label: 'All' },
];

export default function KnowledgeDesk({ open, onClose, onChanged, refreshToken = 0 }) {
  const [filter, setFilter] = useState('pending');
  const [busyId, setBusyId] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [draftTopic, setDraftTopic] = useState('');
  const [draftContent, setDraftContent] = useState('');
  const [error, setError] = useState('');
  const canModerate = canModerateKnowledge();
  const role = getSessionRole();
  const username = getSessionUsername();

  const entries = useMemo(() => {
    void refreshToken;
    const all = getKnowledgeDeskEntries();
    if (filter === 'all') return all;
    return all.filter((e) => e.status === filter);
  }, [filter, refreshToken]);

  if (!open) return null;

  const run = async (id, fn) => {
    setBusyId(id);
    setError('');
    try {
      await fn();
      onChanged?.();
    } catch (err) {
      console.error(err);
      setError(err?.message || 'Knowledge desk action failed');
    } finally {
      setBusyId(null);
    }
  };

  const handleExport = () => {
    const blob = new Blob([exportKnowledgeJson()], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `aintegration-knowledge-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="modal-panel knowledge-desk"
        role="dialog"
        aria-modal="true"
        aria-labelledby="knowledge-desk-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="knowledge-desk-header">
          <div>
            <h2 id="knowledge-desk-title">
              <BookMarked size={18} /> Team knowledge desk
            </h2>
            <p className="modal-lead">
              {isSharedKnowledgeEnabled()
                ? canModerate
                  ? `Signed in as ${username || 'admin'} — you can approve support feedback.`
                  : `Signed in as ${username || 'support'} — submit accuracy feedback; integrationsteam approves.`
                : 'Local-only mode (VITE_KB_API_URL not configured).'}
              {role ? ` Role: ${role}.` : ''}
            </p>
          </div>
          <button type="button" className="icon-ghost-btn" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>

        <div className="knowledge-desk-toolbar">
          <div className="filter-pills">
            {FILTERS.map((f) => (
              <button
                key={f.id}
                type="button"
                className={`filter-pill ${filter === f.id ? 'active' : ''}`}
                onClick={() => setFilter(f.id)}
              >
                {f.label}
              </button>
            ))}
          </div>
          {canModerate && (
            <button type="button" className="desk-export-btn" onClick={handleExport}>
              <Download size={14} /> Export JSON
            </button>
          )}
        </div>

        {error && <div className="desk-error">{error}</div>}

        <div className="knowledge-desk-list">
          {entries.length === 0 && <p className="desk-empty">No entries in this filter.</p>}
          {entries.map((entry) => (
            <article key={entry.id} className={`desk-card status-${entry.status}`}>
              <div className="desk-card-meta">
                <span className={`status-chip ${entry.status}`}>{entry.status}</span>
                <span className="source-chip">{entry.source || 'teach'}</span>
                {entry.submittedBy && (
                  <span className="source-chip">by {entry.submittedBy}</span>
                )}
              </div>
              {canModerate && editingId === entry.id ? (
                <>
                  <input
                    className="desk-edit-topic"
                    value={draftTopic}
                    onChange={(e) => setDraftTopic(e.target.value)}
                  />
                  <textarea
                    className="desk-edit-content"
                    rows={4}
                    value={draftContent}
                    onChange={(e) => setDraftContent(e.target.value)}
                  />
                  <div className="desk-card-actions">
                    <button
                      type="button"
                      className="approve-btn"
                      disabled={busyId === entry.id}
                      onClick={() =>
                        run(entry.id, async () => {
                          await updateKnowledge(entry.id, {
                            topic: draftTopic.trim(),
                            content: draftContent.trim(),
                          });
                          setEditingId(null);
                        })
                      }
                    >
                      Save
                    </button>
                    <button type="button" className="reject-btn" onClick={() => setEditingId(null)}>
                      Cancel
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <h3>{entry.topic}</h3>
                  <p>{entry.content}</p>
                  <div className="desk-card-actions">
                    {canModerate && entry.status !== 'approved' && (
                      <button
                        type="button"
                        className="approve-btn"
                        disabled={busyId === entry.id}
                        onClick={() => run(entry.id, () => approveKnowledge(entry.id))}
                      >
                        <CheckCircle size={14} /> Approve
                      </button>
                    )}
                    {canModerate && entry.status === 'pending' && (
                      <button
                        type="button"
                        className="reject-btn"
                        disabled={busyId === entry.id}
                        onClick={() => run(entry.id, () => rejectKnowledge(entry.id))}
                      >
                        Reject
                      </button>
                    )}
                    {canModerate && (
                      <>
                        <button
                          type="button"
                          className="desk-icon-btn"
                          onClick={() => {
                            setEditingId(entry.id);
                            setDraftTopic(entry.topic || '');
                            setDraftContent(entry.content || '');
                          }}
                          title="Edit"
                        >
                          <Pencil size={14} />
                        </button>
                        <button
                          type="button"
                          className="desk-icon-btn danger"
                          disabled={busyId === entry.id}
                          onClick={() => run(entry.id, () => deleteKnowledge(entry.id))}
                          title="Delete"
                        >
                          <Trash2 size={14} />
                        </button>
                      </>
                    )}
                    {!canModerate && entry.status === 'pending' && (
                      <span className="desk-waiting">Waiting for integrationsteam approval</span>
                    )}
                  </div>
                </>
              )}
            </article>
          ))}
        </div>
      </div>
    </div>
  );
}

