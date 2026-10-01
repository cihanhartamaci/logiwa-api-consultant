import { useState, useRef, useEffect, useCallback } from 'react';
import { Bot, Send, User, Activity, Box, Lock, Key, CheckCircle, Search, Save, Trash2, BookOpen, Waypoints, ExternalLink, LogOut, HelpCircle, BookMarked, FilePlus } from 'lucide-react';
import { generateConsultantResponse, looksLikeGeminiApiKey, normalizeGeminiApiKey, explainGeminiKeyError } from './services/gemini';
import {
  approveKnowledge,
  getKnowledgeDeskEntries,
  onLearnedCorpusChange,
  refreshKnowledgeFromRemote,
  rejectKnowledge,
  saveKnowledge,
  submitAnswerFeedback,
} from './services/knowledgeBase';
import {
  canModerateKnowledge,
  clearSession,
  getSessionToken,
  hasLocalAuthFlag,
  isAuthError,
  isKbApiConfigured,
  isSessionAuthenticated,
} from './services/kbApi';
import { setLearnedKnowledgeCorpus } from './constants/contextFilter';
import { SOURCE_STATS } from './constants/sourceStats';
import TypewriterMarkdown from './components/TypewriterMarkdown';
import LoginScreen from './components/LoginScreen';
import CinematicVideoOverlay, {
  LOGIN_CINEMATIC_VIDEO_ID,
  LOGOUT_CINEMATIC_VIDEO_ID,
} from './components/CinematicVideoOverlay';
import ApiKeyInstructionsModal from './components/ApiKeyInstructionsModal';
import FeedbackBar, { CorrectionModal } from './components/FeedbackBar';
import KnowledgeDesk from './components/KnowledgeDesk';
import DocumentSubmitModal from './components/DocumentSubmitModal';
import BrandName from './components/BrandName';
import logiwaLogo from './assets/logiwa-logo.png';
import logiwaMark from './assets/logiwa-mark.png';
import './App.css';

const SUGGESTED_PROMPTS = [
  {
    title: 'LQL date filter',
    detail: 'Serial tracking by CreatedDate',
    prompt: 'How do I use LQL to filter Serial Tracking by CreatedDate?',
  },
  {
    title: 'API environments',
    detail: 'Production and sandbox base URLs',
    prompt: 'What are the production and sandbox base URLs?',
  },
  {
    title: 'Webhooks',
    detail: 'Available event subscriptions',
    prompt: 'Give me a list of available webhooks.',
  },
];

const HISTORY_KEY = 'logiwa_chat_history';
const TTL_HOURS = 24;

function App() {
  const [messages, setMessages] = useState(() => {
    const saved = localStorage.getItem(HISTORY_KEY);
    if (!saved) return [];
    try {
      const { timestamp, data } = JSON.parse(saved);
      const hoursPassed = (Date.now() - timestamp) / (1000 * 60 * 60);
      if (hoursPassed > TTL_HOURS) {
        localStorage.removeItem(HISTORY_KEY);
        return [];
      }
      return Array.isArray(data)
        ? data.map((msg) => {
            const rest = { ...msg };
            delete rest.animate;
            return rest;
          })
        : [];
    } catch (e) {
      console.error('Failed to load history', e);
      return [];
    }
  });
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [toolStatus, setToolStatus] = useState(''); // e.g. "Searching Help Center..."
  const [apiKey, setApiKey] = useState(() => localStorage.getItem('logiwa_api_key') || '');
  const [pollinationsKey, setPollinationsKey] = useState(
    () => localStorage.getItem('logiwa_pollinations_key') || ''
  );
  const [enablePollinationsFallback, setEnablePollinationsFallback] = useState(
    () => localStorage.getItem('logiwa_pollinations_fallback') !== 'false'
  );
  const [isAuthenticated, setIsAuthenticated] = useState(() => {
    // Shared KB needs a Worker token; clear leftover signed-in flag from older builds.
    if (isKbApiConfigured() && !getSessionToken() && hasLocalAuthFlag()) {
      clearSession();
      return false;
    }
    return isSessionAuthenticated();
  });
  const [cinematic, setCinematic] = useState(null);
  const [showKeyHelp, setShowKeyHelp] = useState(false);
  const [showKnowledgeDesk, setShowKnowledgeDesk] = useState(false);
  const [showDocumentModal, setShowDocumentModal] = useState(false);
  const [deskRefreshToken, setDeskRefreshToken] = useState(0);
  const [correctionTarget, setCorrectionTarget] = useState(null);
  const [feedbackBusy, setFeedbackBusy] = useState(false);
  
  const messagesEndRef = useRef(null);
  const textareaRef = useRef(null);
  const messagesRef = useRef(messages);

  const syncProposedKnowledgeWithDesk = useCallback(() => {
    const byId = new Map(getKnowledgeDeskEntries().map((e) => [e.id, e]));
    setMessages((prev) => {
      let changed = false;
      const next = prev.map((msg) => {
        const pk = msg.proposedKnowledge;
        if (!pk?.id) return msg;
        const entry = byId.get(pk.id);
        if (!entry) {
          changed = true;
          return { ...msg, proposedKnowledge: null, approved: false };
        }
        if (entry.status === 'approved' && !msg.approved) {
          changed = true;
          return { ...msg, approved: true };
        }
        if (entry.status === 'rejected') {
          changed = true;
          return { ...msg, proposedKnowledge: null, approved: false };
        }
        return msg;
      });
      return changed ? next : prev;
    });
  }, []);

  const bumpDesk = useCallback(() => {
    setDeskRefreshToken((n) => n + 1);
    syncProposedKnowledgeWithDesk();
  }, [syncProposedKnowledgeWithDesk]);

  useEffect(() => {
    onLearnedCorpusChange((entries) => setLearnedKnowledgeCorpus(entries));
  }, []);

  useEffect(() => {
    if (!isAuthenticated) return undefined;
    let cancelled = false;
    (async () => {
      try {
        await refreshKnowledgeFromRemote();
        if (!cancelled) bumpDesk();
      } catch (err) {
        console.error('Knowledge refresh failed', err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, bumpDesk]);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  // Save chat history on change
  useEffect(() => {
    if (messages.length > 0) {
      localStorage.setItem(HISTORY_KEY, JSON.stringify({
        timestamp: Date.now(),
        data: messages.map((msg) => {
          const rest = { ...msg };
          delete rest.animate;
          return rest;
        })
      }));
    }
  }, [messages]);

  useEffect(() => {
    localStorage.setItem('logiwa_api_key', apiKey);
  }, [apiKey]);

  useEffect(() => {
    localStorage.setItem('logiwa_pollinations_key', pollinationsKey);
  }, [pollinationsKey]);

  useEffect(() => {
    localStorage.setItem(
      'logiwa_pollinations_fallback',
      enablePollinationsFallback ? 'true' : 'false'
    );
  }, [enablePollinationsFallback]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isLoading, toolStatus]);

  const pollinationsReady = enablePollinationsFallback && Boolean(pollinationsKey.trim());
  const geminiReady = looksLikeGeminiApiKey(apiKey);
  const canAsk = geminiReady || pollinationsReady;

  const handleGeminiKeyChange = (value) => {
    setApiKey(value);
  };

  const validateApiKey = () => {
    const normalized = normalizeGeminiApiKey(apiKey);
    setApiKey(normalized);
    if (!looksLikeGeminiApiKey(normalized)) {
      alert('Paste a Gemini API key from https://aistudio.google.com/apikey.');
    }
  };

  const handleInputChange = (e) => {
    setInput(e.target.value);
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 150)}px`;
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleClearHistory = () => {
    if (window.confirm("Are you sure you want to clear the chat history?")) {
      setMessages([]);
      localStorage.removeItem(HISTORY_KEY);
    }
  };

  const handleSend = async () => {
    const trimmedInput = input.trim();
    if (!trimmedInput || isLoading) return;

    if (!canAsk) {
      alert("Connect a Gemini API key, or enable Pollinations fallback and paste a free key from https://enter.pollinations.ai");
      return;
    }

    const newUserMessage = { role: 'user', content: trimmedInput };
    const historyForModel = [
      ...messagesRef.current.map((msg) => (msg.animate ? { ...msg, animate: false } : msg)),
      newUserMessage,
    ];
    setMessages(historyForModel);
    setInput('');
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
    setIsLoading(true);
    setToolStatus('');

    try {
      let currentProposedKnowledge = null;
      let answerProvider = geminiReady ? 'gemini' : 'pollinations';

      const responseText = await generateConsultantResponse(
        normalizeGeminiApiKey(apiKey), 
        historyForModel,
        (toolName, args) => {
          if (toolName === 'searchDocumentation') setToolStatus(`Searching all Logiwa documentation for "${args.query}"...`);
          if (toolName === 'searchHelpCenter') setToolStatus(`Searching Help Center for "${args.query}"...`);
          if (toolName === 'searchSwagger') setToolStatus(`Searching API Docs for "${args.query}"...`);
          if (toolName === 'rateLimitWait') setToolStatus(`Rate limit exceeded. Waiting ${args.seconds} seconds...`);
          if (toolName === 'geminiModel') setToolStatus(`Asking Gemini (${args.model})...`);
          if (toolName === 'geminiModelFailed') {
            setToolStatus(
              args.rateLimited
                ? `Gemini ${args.model} quota exhausted — trying the next Gemini model...`
                : `Gemini ${args.model} failed — trying next model...`
            );
          }
          if (toolName === 'fallbackProvider') {
            if (args.provider === 'localDesk') {
              answerProvider = 'localDesk';
              setToolStatus('Gemini and Pollinations unavailable — opening the local documentation desk...');
              return;
            }
            answerProvider = 'pollinations';
            const modelLabel = args.model ? ` (${args.model})` : '';
            setToolStatus(`Gemini unavailable — switching to free Pollinations fallback${modelLabel}...`);
          }
        },
        (topic, content) => {
          currentProposedKnowledge = { topic, content, source: 'proposeLearnedKnowledge' };
          setToolStatus('');
        },
        {
          enablePollinationsFallback,
          pollinationsApiKey: pollinationsKey.trim(),
        }
      );

      setMessages((prev) => [
        ...prev, 
        { 
          role: 'model', 
          content: responseText,
          proposedKnowledge: currentProposedKnowledge,
          approved: false,
          animate: true,
          provider: answerProvider,
          feedbackRating: null,
        }
      ]);
    } catch (error) {
      console.error(error);
      const details = explainGeminiKeyError(error);
      setMessages((prev) => [
        ...prev,
        { role: 'model', content: `**Error:** I encountered an issue. Details: ${details}` }
      ]);
    } finally {
      setIsLoading(false);
      setToolStatus('');
    }
  };

  const handleStreamComplete = (index) => {
    setMessages((prev) => {
      if (!prev[index]?.animate) return prev;
      const next = [...prev];
      next[index] = { ...next[index], animate: false };
      return next;
    });
  };

  const findPriorUserQuestion = (index) => {
    for (let i = index - 1; i >= 0; i -= 1) {
      if (messagesRef.current[i]?.role === 'user') return messagesRef.current[i].content || '';
    }
    return '';
  };

  const handleApproveKnowledge = async (index, knowledge) => {
    try {
      if (knowledge.id) {
        await approveKnowledge(knowledge.id, {
          topic: knowledge.topic,
          content: knowledge.content,
        });
      } else {
        await saveKnowledge(knowledge.topic, knowledge.content, {
          status: 'approved',
          source: knowledge.source || 'proposeLearnedKnowledge',
        });
      }
      setMessages((prev) => {
        const next = [...prev];
        next[index] = { ...next[index], approved: true };
        return next;
      });
      bumpDesk();
    } catch (err) {
      console.error(err);
      if (!requireSessionOrLogout(err)) {
        alert(err?.message || 'Failed to save knowledge');
      }
    }
  };

  const handleRejectKnowledge = async (index) => {
    const knowledge = messagesRef.current[index]?.proposedKnowledge;
    try {
      if (knowledge?.id) await rejectKnowledge(knowledge.id);
      setMessages((prev) => {
        const next = [...prev];
        next[index] = { ...next[index], proposedKnowledge: null };
        return next;
      });
      bumpDesk();
    } catch (err) {
      console.error(err);
      if (!requireSessionOrLogout(err)) {
        alert(err?.message || 'Failed to reject knowledge');
      }
    }
  };

  const requireSessionOrLogout = (err) => {
    if (!isAuthError(err)) return false;
    clearSession();
    setIsAuthenticated(false);
    alert('Session expired. Please sign in again with your team username/password.');
    return true;
  };

  const handleFeedbackUp = async (index) => {
    const msg = messagesRef.current[index];
    if (!msg || msg.feedbackRating) return;
    setFeedbackBusy(true);
    try {
      await submitAnswerFeedback({
        rating: 'up',
        questionText: findPriorUserQuestion(index),
        answerText: msg.content,
        provider: msg.provider || null,
      });
      setMessages((prev) => {
        const next = [...prev];
        next[index] = { ...next[index], feedbackRating: 'up' };
        return next;
      });
    } catch (err) {
      console.error(err);
      if (!requireSessionOrLogout(err)) {
        alert(err?.message || 'Failed to save feedback');
      }
    } finally {
      setFeedbackBusy(false);
    }
  };

  const handleFeedbackDown = (index) => {
    const msg = messagesRef.current[index];
    if (!msg || msg.feedbackRating) return;
    setCorrectionTarget({ index });
  };

  const handleCorrectionSubmit = async (correctionText) => {
    if (!correctionTarget) return;
    const { index } = correctionTarget;
    const msg = messagesRef.current[index];
    if (!msg) return;
    setFeedbackBusy(true);
    try {
      const { pendingKnowledge } = await submitAnswerFeedback({
        rating: 'down',
        questionText: findPriorUserQuestion(index),
        answerText: msg.content,
        correctionText,
        provider: msg.provider || null,
      });
      setMessages((prev) => {
        const next = [...prev];
        const autoApproved = pendingKnowledge?.status === 'approved' || canModerateKnowledge();
        next[index] = {
          ...next[index],
          feedbackRating: 'down',
          proposedKnowledge: pendingKnowledge
            ? {
                id: pendingKnowledge.id,
                topic: pendingKnowledge.topic,
                content: pendingKnowledge.content,
                source: 'correction',
                status: pendingKnowledge.status,
              }
            : {
                topic: correctionText.slice(0, 120),
                content: correctionText,
                source: 'correction',
              },
          approved: autoApproved,
        };
        return next;
      });
      setCorrectionTarget(null);
      bumpDesk();
    } catch (err) {
      console.error(err);
      if (!requireSessionOrLogout(err)) {
        alert(err?.message || 'Failed to save correction');
      }
    } finally {
      setFeedbackBusy(false);
    }
  };

  const handleSuggestedPrompt = (prompt) => {
    setInput(prompt);
    if (textareaRef.current) {
      textareaRef.current.focus();
    }
  };

  const handleLoginSuccess = () => {
    setCinematic({
      videoId: LOGIN_CINEMATIC_VIDEO_ID,
      mode: 'login',
    });
  };

  const handleLogout = () => {
    setCinematic({
      videoId: LOGOUT_CINEMATIC_VIDEO_ID,
      mode: 'logout',
    });
  };

  const handleCinematicFinished = () => {
    if (cinematic?.mode === 'login') {
      setIsAuthenticated(true);
    } else if (cinematic?.mode === 'logout') {
      clearSession();
      setIsAuthenticated(false);
    }
    setCinematic(null);
  };

  if (!isAuthenticated) {
    return (
      <>
        <LoginScreen onSuccess={handleLoginSuccess} />
        {cinematic && (
          <CinematicVideoOverlay
            videoId={cinematic.videoId}
            mode={cinematic.mode}
            onFinished={handleCinematicFinished}
          />
        )}
      </>
    );
  }

  return (
    <div className="app-container">
      {/* Sidebar */}
      <aside className="sidebar glass">
        <div className="sidebar-header">
          <img src={logiwaLogo} alt="Logiwa" className="brand-logo" />
          <div className="brand-copy">
            <div className="logo-text"><BrandName /></div>
          </div>
        </div>

        <div className="sidebar-body">
          <div className="source-grid">
            <div className="source-stat">
              <span className="source-stat-value">{SOURCE_STATS.helpCenterArticles}</span>
              <span className="source-stat-label">Help Center articles</span>
            </div>
            <div className="source-stat">
              <span className="source-stat-value">{SOURCE_STATS.swaggerOperations}</span>
              <span className="source-stat-label">API operations</span>
            </div>
            <div className="source-stat">
              <span className="source-stat-value">{SOURCE_STATS.knowledgeDocuments}</span>
              <span className="source-stat-label">API support guides</span>
            </div>
          </div>

          <div className="status-list">
            <div className={`status-pill ${geminiReady ? 'on' : ''}`}>
              <span className="status-dot" />
              Gemini {geminiReady ? 'connected' : 'optional'}
            </div>
            <div className={`status-pill ${pollinationsReady ? 'on amber' : ''}`}>
              <span className="status-dot" />
              Pollinations {pollinationsReady ? 'ready' : 'fallback'}
            </div>
            <div
              className="status-pill on"
              title="If Gemini and Pollinations both fail, answers are assembled from the local Logiwa index"
            >
              <span className="status-dot" />
              Docs desk standby
            </div>
          </div>

          {canModerateKnowledge() && (
            <button
              type="button"
              className="clear-chat-btn knowledge-desk-btn"
              onClick={() => setShowKnowledgeDesk(true)}
            >
              <BookMarked size={16} style={{ marginRight: '8px' }} />
              Knowledge desk
            </button>
          )}

          <button
            type="button"
            className="clear-chat-btn document-submit-btn"
            onClick={() => setShowDocumentModal(true)}
          >
            <FilePlus size={16} style={{ marginRight: '8px' }} />
            Add best-practice doc
          </button>
          
          {messages.length > 0 && (
            <button className="clear-chat-btn" onClick={handleClearHistory}>
              <Trash2 size={16} style={{ marginRight: '8px' }} />
              Clear Chat History
            </button>
          )}
        </div>

        <div className="api-stats">
          <div className="stat-row">
            <span className="stat-label"><Activity size={14} style={{ display: 'inline', marginRight: '6px', verticalAlign: 'text-bottom' }}/> API Version</span>
            <span className="stat-value">v3.1</span>
          </div>
          <div className="stat-row">
            <span className="stat-label"><Box size={14} style={{ display: 'inline', marginRight: '6px', verticalAlign: 'text-bottom' }}/> Rate Limit</span>
            <span className="stat-value">6 req/s</span>
          </div>
          <div className="stat-row">
            <span className="stat-label"><Lock size={14} style={{ display: 'inline', marginRight: '6px', verticalAlign: 'text-bottom' }}/> Auth</span>
            <span className="stat-value">Bearer Token</span>
          </div>
        </div>
        <p className="app-credit">Developed by cihanhartamaci with the assistance of Cursor.</p>
        <button type="button" className="logout-btn" onClick={handleLogout}>
          <LogOut size={16} style={{ marginRight: '8px' }} />
          Log out
        </button>
      </aside>

      {/* Main Content */}
      <main className="main-content">
        <div className="top-bar">
          {(messages.length > 0 || canAsk) && (
            geminiReady ? (
              <div className="api-key-container connected-badge">
                <CheckCircle size={16} color="#4ADE80" />
                <span style={{ color: '#4ADE80', fontSize: '0.85rem', fontWeight: '500' }}>Gemini connected</span>
                <button 
                   onClick={() => { setApiKey(''); }}
                   className="disconnect-btn"
                   title="Disconnect Gemini API Key"
                >
                  ✕
                </button>
              </div>
            ) : (
              <div className="api-key-container">
                <Key size={16} color="var(--text-secondary)" />
                <input 
                  type="password" 
                  className="api-key-input" 
                  placeholder="Gemini API Key" 
                  value={apiKey}
                  onChange={(e) => handleGeminiKeyChange(e.target.value)}
                  autoComplete="new-password"
                />
                <button onClick={validateApiKey} className="connect-btn" disabled={!apiKey || isLoading}>
                  {isLoading ? '...' : 'Connect'}
                </button>
              </div>
            )
          )}
          <div className="fallback-controls">
            <button
              type="button"
              className="key-help-trigger"
              onClick={() => setShowKeyHelp(true)}
              title="How to get Gemini and Pollinations API keys"
            >
              <HelpCircle size={15} />
              <span>Key help</span>
            </button>
            <label className="fallback-toggle" title="If Gemini fails, reuse the same Logiwa sources with Pollinations (free key required)">
              <input
                type="checkbox"
                checked={enablePollinationsFallback}
                onChange={(e) => setEnablePollinationsFallback(e.target.checked)}
              />
              <span>Pollinations fallback</span>
            </label>
            {enablePollinationsFallback && (messages.length > 0 || canAsk) && (
              <input
                type="password"
                className="fallback-key-input"
                placeholder="Pollinations key (required) — enter.pollinations.ai"
                value={pollinationsKey}
                onChange={(e) => setPollinationsKey(e.target.value)}
                autoComplete="new-password"
                title="Free key from https://enter.pollinations.ai — required because Pollinations no longer allows anonymous text calls"
              />
            )}
            {pollinationsReady && !geminiReady && (
              <span className="connected-badge pollinations fallback-ready-hint">
                <CheckCircle size={14} color="#4bb7e0" />
                Ready
              </span>
            )}
          </div>
          <button type="button" className="logout-btn logout-btn-top" onClick={handleLogout}>
            <LogOut size={16} />
            Log out
          </button>
        </div>

        <div className="chat-container">
          {messages.length === 0 ? (
            <div className="welcome-screen animate-fade-in">
              <img src={logiwaMark} alt="" className="welcome-logo" />
              <div className="welcome-chips">
                <span className="welcome-chip">
                  <BookOpen size={14} /> {SOURCE_STATS.helpCenterArticles} Help Center articles
                </span>
                <span className="welcome-chip">
                  <Waypoints size={14} /> {SOURCE_STATS.swaggerOperations} Open API {SOURCE_STATS.openApiVersion} operations
                </span>
                <span className="welcome-chip">
                  <BookOpen size={14} /> {SOURCE_STATS.knowledgeDocuments} API support guides
                </span>
              </div>
              <h1 className="welcome-title"><BrandName as="span" /></h1>
              <p className="welcome-text">
                I search the Logiwa spec, Help Center, and API support guides before answering — including mapping playbooks for Integration Engineers (SAP, NetSuite, eBay, Shippo, FedEx, and similar). Connect Gemini for the full expert, or paste a free Pollinations key to start immediately.
              </p>
              <button
                type="button"
                className="key-help-welcome-btn"
                onClick={() => setShowKeyHelp(true)}
              >
                <HelpCircle size={16} />
                How to get Gemini & Pollinations API keys
              </button>

              {!canAsk && (
                <div className="setup-grid">
                  <div className="setup-card">
                    <div className="setup-card-kicker">Recommended</div>
                    <h2 className="setup-card-title">Gemini</h2>
                    <p className="setup-card-copy">
                      Paste your own key from aistudio.google.com/apikey. Restrict it to this site:
                      {' '}
                      <code>https://cihanhartamaci.github.io/*</code>
                      . Google now blocks unrestricted keys.
                    </p>
                    <div className="setup-card-row">
                      <Key size={16} color="var(--text-secondary)" />
                      <input
                        type="password"
                        className="setup-card-input"
                        placeholder="Paste Gemini API key"
                        value={apiKey}
                        onChange={(e) => handleGeminiKeyChange(e.target.value)}
                        autoComplete="new-password"
                      />
                      <button onClick={validateApiKey} className="connect-btn" disabled={!apiKey || isLoading}>
                        Connect
                      </button>
                    </div>
                  </div>
                  {enablePollinationsFallback && (
                    <div className="setup-card">
                      <div className="setup-card-kicker">Free fallback</div>
                      <h2 className="setup-card-title">Pollinations</h2>
                      <p className="setup-card-copy">Works without Gemini. Shorter prompt, same Logiwa sources.</p>
                      <div className="setup-card-row">
                        <Key size={16} color="var(--text-secondary)" />
                        <input
                          type="password"
                          className="setup-card-input"
                          placeholder="Paste Pollinations key"
                          value={pollinationsKey}
                          onChange={(e) => setPollinationsKey(e.target.value)}
                          autoComplete="new-password"
                        />
                      </div>
                      <a
                        className="setup-card-link"
                        href="https://enter.pollinations.ai"
                        target="_blank"
                        rel="noreferrer"
                      >
                        Get a free key <ExternalLink size={13} />
                      </a>
                    </div>
                  )}
                </div>
              )}
              
              <div className="suggested-prompts">
                {SUGGESTED_PROMPTS.map((item) => (
                  <button
                    key={item.title}
                    className="prompt-card"
                    onClick={() => handleSuggestedPrompt(item.prompt)}
                  >
                    <span className="prompt-card-title">{item.title}</span>
                    <span className="prompt-card-detail">{item.detail}</span>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            messages.map((msg, idx) => (
              <div key={idx} className={`message-wrapper message-${msg.role === 'user' ? 'user' : 'ai'} animate-fade-in`}>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: msg.role === 'user' ? 'flex-end' : 'flex-start', maxWidth: '100%' }}>
                  <div className={`avatar ${msg.role === 'user' ? 'avatar-user' : 'avatar-ai'}`}>
                    {msg.role === 'user' ? <User size={18} color="white" /> : <Bot size={18} color="white" />}
                  </div>
                  <div className="message-bubble">
                    {msg.role === 'user' ? (
                      <div style={{ whiteSpace: 'pre-wrap' }}>{msg.content}</div>
                    ) : (
                      <>
                        <TypewriterMarkdown
                          content={msg.content}
                          animate={Boolean(msg.animate)}
                          onUpdate={scrollToBottom}
                          onComplete={() => handleStreamComplete(idx)}
                        />

                        {!msg.animate && !String(msg.content || '').startsWith('**Error:**') && (
                          <FeedbackBar
                            rating={msg.feedbackRating}
                            disabled={feedbackBusy}
                            onUp={() => handleFeedbackUp(idx)}
                            onDown={() => handleFeedbackDown(idx)}
                          />
                        )}
                        
                        {msg.proposedKnowledge && !msg.animate && (
                          <div className="knowledge-card animate-fade-in">
                            <div className="knowledge-header">
                              <Save size={18} />
                              <span>Proposed Knowledge to Learn</span>
                            </div>
                            <div className="knowledge-content">
                              <strong>Topic:</strong> {msg.proposedKnowledge.topic}<br/>
                              <strong>Details:</strong> {msg.proposedKnowledge.content}
                            </div>
                            <div className="knowledge-actions">
                              {msg.approved ? (
                                <span className="approved-text"><CheckCircle size={16}/> Saved to Knowledge Base!</span>
                              ) : canModerateKnowledge() ? (
                                <>
                                  <button className="approve-btn" onClick={() => handleApproveKnowledge(idx, msg.proposedKnowledge)}>
                                    Approve & Learn
                                  </button>
                                  <button className="reject-btn" onClick={() => handleRejectKnowledge(idx)}>
                                    Reject
                                  </button>
                                </>
                              ) : (
                                <span className="desk-waiting">Submitted — waiting for integrationsteam approval</span>
                              )}
                            </div>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </div>
              </div>
            ))
          )}
          
          {/* Tool Status Indicator */}
          {toolStatus && (
            <div className="message-wrapper message-ai animate-fade-in">
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
                <div className="avatar avatar-ai">
                  <Search size={18} color="white" />
                </div>
                <div className="message-bubble tool-status">
                   <span className="spinner"></span> {toolStatus}
                </div>
              </div>
            </div>
          )}

          {/* Regular Typing Indicator */}
          {isLoading && !toolStatus && (
            <div className="message-wrapper message-ai animate-fade-in">
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
                <div className="avatar avatar-ai">
                  <Bot size={18} color="white" />
                </div>
                <div className="message-bubble typing-indicator">
                  <div className="dot"></div>
                  <div className="dot"></div>
                  <div className="dot"></div>
                </div>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        <div className="input-container">
          <div className="input-box">
            <textarea
              ref={textareaRef}
              className="chat-input"
              placeholder={canAsk ? "Ask anything about Logiwa APIs..." : "Add a Gemini or Pollinations key to start..."}
              value={input}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              rows={1}
            />
            <button 
              className="send-btn" 
              onClick={handleSend}
              disabled={!input.trim() || isLoading || !canAsk}
            >
              <Send size={20} />
            </button>
          </div>
        </div>
      </main>
      {cinematic && (
        <CinematicVideoOverlay
          videoId={cinematic.videoId}
          mode={cinematic.mode}
          onFinished={handleCinematicFinished}
        />
      )}
      <ApiKeyInstructionsModal open={showKeyHelp} onClose={() => setShowKeyHelp(false)} />
      {canModerateKnowledge() && (
        <KnowledgeDesk
          open={showKnowledgeDesk}
          onClose={() => setShowKnowledgeDesk(false)}
          refreshToken={deskRefreshToken}
          onChanged={bumpDesk}
        />
      )}
      <DocumentSubmitModal
        open={showDocumentModal}
        onClose={() => setShowDocumentModal(false)}
        onSubmitted={bumpDesk}
      />
      <CorrectionModal
        key={correctionTarget ? `c-${correctionTarget.index}` : 'c-closed'}
        open={Boolean(correctionTarget)}
        busy={feedbackBusy}
        onClose={() => setCorrectionTarget(null)}
        onSubmit={handleCorrectionSubmit}
      />
    </div>
  );
}

export default App;
