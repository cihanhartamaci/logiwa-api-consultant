import { useState, useRef, useEffect, useCallback } from 'react';
import { Bot, Send, User, Key, CheckCircle, Search, Save, Trash2, BookOpen, Waypoints, ExternalLink, LogOut, HelpCircle, BookMarked, FilePlus, SquarePen, Menu, X } from 'lucide-react';
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
import {
  deleteConversation,
  formatRelativeTime,
  loadConversationState,
  mapAllMessages,
  saveConversationState,
  startNewConversation,
  switchConversation,
  updateConversationMessages,
} from './services/conversations';
import { stripSourceCitations } from './services/citations';
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

const EMPTY_MESSAGES = [];

function App() {
  const [chatState, setChatState] = useState(() => loadConversationState(localStorage));
  const { conversations, activeId } = chatState;
  const activeConversation = conversations.find((c) => c.id === activeId);
  const messages = activeConversation?.messages ?? EMPTY_MESSAGES;
  const [input, setInput] = useState('');
  // conversationId -> tool status text ('' while the model is thinking)
  const [pendingById, setPendingById] = useState({});
  const isLoading = Object.prototype.hasOwnProperty.call(pendingById, activeId);
  const toolStatus = isLoading ? pendingById[activeId] : '';
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
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  
  const messagesEndRef = useRef(null);
  const textareaRef = useRef(null);
  const drawerToggleRef = useRef(null);
  const drawerCloseRef = useRef(null);
  const messagesRef = useRef(messages);
  const activeIdRef = useRef(activeId);

  const updateMessages = useCallback((conversationId, updater) => {
    setChatState((prev) => {
      const next = updateConversationMessages(prev.conversations, conversationId, updater);
      return next === prev.conversations ? prev : { ...prev, conversations: next };
    });
  }, []);

  const setPendingStatus = useCallback((conversationId, status) => {
    setPendingById((prev) => ({ ...prev, [conversationId]: status }));
  }, []);

  const clearPending = useCallback((conversationId) => {
    setPendingById((prev) => {
      const next = { ...prev };
      delete next[conversationId];
      return next;
    });
  }, []);

  const syncProposedKnowledgeWithDesk = useCallback(() => {
    const byId = new Map(getKnowledgeDeskEntries().map((e) => [e.id, e]));
    setChatState((prev) => {
      const next = mapAllMessages(prev.conversations, (msg) => {
        const pk = msg.proposedKnowledge;
        if (!pk?.id) return msg;
        const entry = byId.get(pk.id);
        if (!entry || entry.status === 'rejected') {
          return { ...msg, proposedKnowledge: null, approved: false };
        }
        if (entry.status === 'approved' && !msg.approved) {
          return { ...msg, approved: true };
        }
        return msg;
      });
      return next === prev.conversations ? prev : { ...prev, conversations: next };
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
    activeIdRef.current = activeId;
  }, [messages, activeId]);

  useEffect(() => {
    saveConversationState(localStorage, chatState);
  }, [chatState]);

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

  const dismissDrawer = useCallback(() => {
    setIsDrawerOpen(false);
    drawerToggleRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!isDrawerOpen) return undefined;
    drawerCloseRef.current?.focus();
    const onKeyDown = (event) => {
      if (event.key === 'Escape') dismissDrawer();
    };
    // The drawer only exists below the 900px breakpoint; drop it if the window grows past that.
    const desktopQuery = window.matchMedia('(min-width: 901px)');
    const onDesktop = (event) => {
      if (event.matches) setIsDrawerOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    desktopQuery.addEventListener('change', onDesktop);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      desktopQuery.removeEventListener('change', onDesktop);
    };
  }, [isDrawerOpen, dismissDrawer]);

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

  const handleNewChat = () => {
    setIsDrawerOpen(false);
    setCorrectionTarget(null);
    setChatState((prev) => startNewConversation(prev));
    textareaRef.current?.focus();
  };

  const handleSelectChat = (conversationId) => {
    setIsDrawerOpen(false);
    if (conversationId === activeId) return;
    setCorrectionTarget(null);
    setChatState((prev) => switchConversation(prev, conversationId));
  };

  const handleDeleteChat = (conversation) => {
    if (!window.confirm(`Delete "${conversation.title}"?`)) return;
    if (conversation.id === activeId) setCorrectionTarget(null);
    setChatState((prev) => deleteConversation(prev, conversation.id));
  };

  const handleSend = async () => {
    const trimmedInput = input.trim();
    if (!trimmedInput || isLoading) return;

    if (!canAsk) {
      alert("Connect a Gemini API key, or enable Pollinations fallback and paste a free key from https://enter.pollinations.ai");
      return;
    }

    const conversationId = activeIdRef.current;
    let finished = false;
    const setToolStatus = (status) => {
      if (!finished) setPendingStatus(conversationId, status);
    };
    const newUserMessage = { role: 'user', content: trimmedInput };
    const historyForModel = [
      ...messagesRef.current.map((msg) => (msg.animate ? { ...msg, animate: false } : msg)),
      newUserMessage,
    ];
    updateMessages(conversationId, () => historyForModel);
    setInput('');
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
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

      updateMessages(conversationId, (prev) => [
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
      updateMessages(conversationId, (prev) => [
        ...prev,
        { role: 'model', content: `**Error:** I encountered an issue. Details: ${details}` }
      ]);
    } finally {
      finished = true;
      clearPending(conversationId);
    }
  };

  const setMessageAt = (conversationId, index, patch) => {
    updateMessages(conversationId, (prev) => {
      if (!prev[index]) return prev;
      const next = [...prev];
      next[index] = { ...next[index], ...patch };
      return next;
    });
  };

  const handleStreamComplete = (conversationId, index) => {
    updateMessages(conversationId, (prev) => {
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
    const conversationId = activeIdRef.current;
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
      setMessageAt(conversationId, index, { approved: true });
      bumpDesk();
    } catch (err) {
      console.error(err);
      if (!requireSessionOrLogout(err)) {
        alert(err?.message || 'Failed to save knowledge');
      }
    }
  };

  const handleRejectKnowledge = async (index) => {
    const conversationId = activeIdRef.current;
    const knowledge = messagesRef.current[index]?.proposedKnowledge;
    try {
      if (knowledge?.id) await rejectKnowledge(knowledge.id);
      setMessageAt(conversationId, index, { proposedKnowledge: null });
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
    const conversationId = activeIdRef.current;
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
      setMessageAt(conversationId, index, { feedbackRating: 'up' });
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
    setCorrectionTarget({ index, conversationId: activeIdRef.current });
  };

  const handleCorrectionSubmit = async (correctionText) => {
    if (!correctionTarget) return;
    const { index, conversationId } = correctionTarget;
    if (conversationId !== activeIdRef.current) return;
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
      updateMessages(conversationId, (prev) => {
        if (!prev[index]) return prev;
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
    setIsDrawerOpen(false);
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
      {/* Sidebar (slide-in drawer below 900px) */}
      <aside
        id="app-sidebar"
        className={`sidebar glass ${isDrawerOpen ? 'open' : ''}`}
        aria-label="Navigation"
      >
        <button
          type="button"
          ref={drawerCloseRef}
          className="drawer-close"
          onClick={dismissDrawer}
          aria-label="Close menu"
        >
          <X size={18} />
        </button>
        <div className="sidebar-header">
          <img src={logiwaLogo} alt="Logiwa" className="brand-logo" />
          <div className="brand-copy">
            <div className="logo-text"><BrandName /></div>
          </div>
        </div>

        <div className="sidebar-body">
          <div className="source-grid">
            <div className="source-stat" title={`${SOURCE_STATS.helpCenterArticles} Help Center articles`}>
              <span className="source-stat-value">{SOURCE_STATS.helpCenterArticles}</span>
              <span className="source-stat-label">Help Center</span>
            </div>
            <div className="source-stat" title={`${SOURCE_STATS.swaggerOperations} Open API operations`}>
              <span className="source-stat-value">{SOURCE_STATS.swaggerOperations}</span>
              <span className="source-stat-label">API ops</span>
            </div>
            <div className="source-stat" title={`${SOURCE_STATS.knowledgeDocuments} API support guides`}>
              <span className="source-stat-value">{SOURCE_STATS.knowledgeDocuments}</span>
              <span className="source-stat-label">Guides</span>
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
              className="status-pill on violet"
              title="If Gemini and Pollinations both fail, answers are assembled from the local Logiwa index"
            >
              <span className="status-dot" />
              Docs desk standby
            </div>
          </div>

          <button
            type="button"
            className="clear-chat-btn new-chat-btn"
            onClick={handleNewChat}
            title="Start a new conversation on a different topic"
          >
            <SquarePen size={14} />
            New chat
          </button>

          {canModerateKnowledge() && (
            <button
              type="button"
              className="clear-chat-btn knowledge-desk-btn"
              onClick={() => {
                setIsDrawerOpen(false);
                setShowKnowledgeDesk(true);
              }}
            >
              <BookMarked size={14} />
              Knowledge desk
            </button>
          )}

          <button
            type="button"
            className="clear-chat-btn document-submit-btn"
            onClick={() => {
              setIsDrawerOpen(false);
              setShowDocumentModal(true);
            }}
          >
            <FilePlus size={14} />
            Add best-practice doc
          </button>

          <section className="chat-list-section" aria-label="Chats">
            <div className="chat-list-heading">Chats</div>
            <ul className="chat-list">
              {conversations.map((conversation) => {
                const isActive = conversation.id === activeId;
                const isPending = Object.prototype.hasOwnProperty.call(pendingById, conversation.id);
                return (
                  <li key={conversation.id} className={`chat-list-item ${isActive ? 'active' : ''}`}>
                    <button
                      type="button"
                      className="chat-list-select"
                      onClick={() => handleSelectChat(conversation.id)}
                      title={conversation.title}
                      aria-current={isActive ? 'true' : undefined}
                    >
                      <span className="chat-list-title">{conversation.title}</span>
                      <span className="chat-list-time">
                        {isPending ? <span className="chat-list-pending" aria-label="Waiting for reply" /> : formatRelativeTime(conversation.updatedAt)}
                      </span>
                    </button>
                    <button
                      type="button"
                      className="chat-list-delete"
                      onClick={() => handleDeleteChat(conversation)}
                      title="Delete chat"
                      aria-label={`Delete chat ${conversation.title}`}
                    >
                      <Trash2 size={12} />
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        </div>

        <p className="app-credit">Developed by cihanhartamaci with the assistance of Cursor.</p>
        <button type="button" className="logout-btn" onClick={handleLogout}>
          <LogOut size={14} />
          Log out
        </button>
      </aside>
      {isDrawerOpen && (
        <div className="drawer-backdrop" role="presentation" onClick={dismissDrawer} />
      )}

      {/* Main Content */}
      <main className="main-content">
        <div className="top-bar">
          <button
            type="button"
            ref={drawerToggleRef}
            className="drawer-toggle"
            onClick={() => setIsDrawerOpen(true)}
            aria-label="Open menu"
            aria-expanded={isDrawerOpen}
            aria-controls="app-sidebar"
          >
            <Menu size={20} />
          </button>
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
        </div>

        <div className="chat-container" key={activeId}>
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
                          content={stripSourceCitations(msg.content)}
                          animate={Boolean(msg.animate)}
                          onUpdate={scrollToBottom}
                          onComplete={() => handleStreamComplete(activeId, idx)}
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
