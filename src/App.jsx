import { useState, useRef, useEffect } from 'react';
import { Bot, Send, User, Activity, Box, Lock, Key, CheckCircle, Search, Save, Trash2, BookOpen, Waypoints, ExternalLink } from 'lucide-react';
import { generateConsultantResponse, looksLikeGeminiApiKey } from './services/gemini';
import { saveKnowledge } from './services/knowledgeBase';
import { SOURCE_STATS } from './constants/sourceStats';
import TypewriterMarkdown from './components/TypewriterMarkdown';
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
  const [messages, setMessages] = useState([]);
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
  const [isKeyValid, setIsKeyValid] = useState(
    () => looksLikeGeminiApiKey(localStorage.getItem('logiwa_api_key'))
  );
  
  const messagesEndRef = useRef(null);
  const textareaRef = useRef(null);
  const messagesRef = useRef(messages);
  messagesRef.current = messages;

  // Load chat history on mount
  useEffect(() => {
    const saved = localStorage.getItem(HISTORY_KEY);
    if (saved) {
      try {
        const { timestamp, data } = JSON.parse(saved);
        const hoursPassed = (Date.now() - timestamp) / (1000 * 60 * 60);
        if (hoursPassed > TTL_HOURS) {
          localStorage.removeItem(HISTORY_KEY);
        } else {
          setMessages(
            Array.isArray(data)
              ? data.map((msg) => {
                  const rest = { ...msg };
                  delete rest.animate;
                  return rest;
                })
              : data
          );
        }
      } catch (e) {
        console.error("Failed to load history", e);
      }
    }
  }, []);

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
  const canAsk = isKeyValid || pollinationsReady;

  const validateApiKey = () => {
    if (!apiKey) return;
    if (!looksLikeGeminiApiKey(apiKey)) {
      alert("Invalid Gemini API key format. Keys start with AIza and are at least 24 characters.");
      setIsKeyValid(false);
      return;
    }
    setIsKeyValid(true);
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

      const responseText = await generateConsultantResponse(
        apiKey, 
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
                ? `Gemini ${args.model} hit a rate limit — switching to Pollinations...`
                : `Gemini ${args.model} failed — trying next model...`
            );
          }
          if (toolName === 'fallbackProvider') {
            const modelLabel = args.model ? ` (${args.model})` : '';
            setToolStatus(`Gemini unavailable — switching to free Pollinations fallback${modelLabel}...`);
          }
        },
        (topic, content) => {
          currentProposedKnowledge = { topic, content };
          setToolStatus(''); // Clear searching status
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
          animate: true
        }
      ]);
    } catch (error) {
      console.error(error);
      if (error.message.includes("API key not valid") || error.message.includes("403")) {
         setIsKeyValid(false);
      }
      setMessages((prev) => [
        ...prev,
        { role: 'model', content: `**Error:** I encountered an issue. Details: ${error.message}` }
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

  const handleApproveKnowledge = (index, knowledge) => {
    saveKnowledge(knowledge.topic, knowledge.content);
    setMessages(prev => {
      const newMessages = [...prev];
      newMessages[index].approved = true;
      return newMessages;
    });
  };

  const handleRejectKnowledge = (index) => {
    setMessages(prev => {
      const newMessages = [...prev];
      newMessages[index].proposedKnowledge = null; // Hide the card
      return newMessages;
    });
  };

  const handleSuggestedPrompt = (prompt) => {
    setInput(prompt);
    if (textareaRef.current) {
      textareaRef.current.focus();
    }
  };

  return (
    <div className="app-container">
      {/* Sidebar */}
      <aside className="sidebar glass">
        <div className="sidebar-header">
          <img src={logiwaLogo} alt="Logiwa" className="brand-logo" />
          <div className="brand-copy">
            <div className="logo-text text-gradient">AIntegration</div>
            <div className="logo-sub">Logiwa Open API</div>
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
          </div>

          <div className="status-list">
            <div className={`status-pill ${isKeyValid ? 'on' : ''}`}>
              <span className="status-dot" />
              Gemini {isKeyValid ? 'connected' : 'optional'}
            </div>
            <div className={`status-pill ${pollinationsReady ? 'on amber' : ''}`}>
              <span className="status-dot" />
              Pollinations {pollinationsReady ? 'ready' : 'fallback'}
            </div>
          </div>

          <p className="sidebar-guide">
            Answers cite Open API {SOURCE_STATS.openApiVersion} and the Intercom Help Center. Keys stay in this browser.
          </p>
          
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
      </aside>

      {/* Main Content */}
      <main className="main-content">
        <div className="top-bar">
          {(messages.length > 0 || canAsk) && (
            isKeyValid ? (
              <div className="api-key-container connected-badge">
                <CheckCircle size={16} color="#4ADE80" />
                <span style={{ color: '#4ADE80', fontSize: '0.85rem', fontWeight: '500' }}>Gemini connected</span>
                <button 
                   onClick={() => { setIsKeyValid(false); setApiKey(''); }}
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
                  onChange={(e) => setApiKey(e.target.value)}
                  autoComplete="new-password"
                />
                <button onClick={validateApiKey} className="connect-btn" disabled={!apiKey || isLoading}>
                  {isLoading ? '...' : 'Connect'}
                </button>
              </div>
            )
          )}
          <div className="fallback-controls">
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
            {pollinationsReady && !isKeyValid && (
              <span className="connected-badge pollinations fallback-ready-hint">
                <CheckCircle size={14} color="#4bb7e0" />
                Ready
              </span>
            )}
          </div>
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
              </div>
              <h1 className="welcome-title text-gradient">AIntegration</h1>
              <p className="welcome-text">
                I search the live Logiwa spec and Help Center before answering. Connect Gemini for the full expert, or paste a free Pollinations key to start immediately.
              </p>

              {!canAsk && (
                <div className="setup-grid">
                  <div className="setup-card">
                    <div className="setup-card-kicker">Recommended</div>
                    <h2 className="setup-card-title">Gemini</h2>
                    <p className="setup-card-copy">Best quality answers with source citations.</p>
                    <div className="setup-card-row">
                      <Key size={16} color="var(--text-secondary)" />
                      <input
                        type="password"
                        className="setup-card-input"
                        placeholder="Paste Gemini API key"
                        value={apiKey}
                        onChange={(e) => setApiKey(e.target.value)}
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
                        
                        {/* Knowledge Proposal Card */}
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
                              ) : (
                                <>
                                  <button className="approve-btn" onClick={() => handleApproveKnowledge(idx, msg.proposedKnowledge)}>
                                    Approve & Learn
                                  </button>
                                  <button className="reject-btn" onClick={() => handleRejectKnowledge(idx)}>
                                    Reject
                                  </button>
                                </>
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
    </div>
  );
}

export default App;
