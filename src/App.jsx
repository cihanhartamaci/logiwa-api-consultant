import { useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import { Bot, Send, User, Zap, Activity, Box, Lock, Key, CheckCircle, Search, Save, Trash2 } from 'lucide-react';
import { generateConsultantResponse } from './services/gemini';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { saveKnowledge } from './services/knowledgeBase';
import './App.css';

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
    () => localStorage.getItem('logiwa_api_key')?.startsWith("AIzaSy") || false
  );
  
  const messagesEndRef = useRef(null);
  const textareaRef = useRef(null);

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
          setMessages(data);
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
        data: messages
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

  const validateApiKey = async () => {
    if (!apiKey) return;
    setIsLoading(true);
    try {
      if (!apiKey.startsWith("AIzaSy")) {
         throw new Error("Invalid API Key format. It should start with 'AIzaSy'.");
      }
      const genAI = new GoogleGenerativeAI(apiKey);
      const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
      await model.generateContent({
        contents: [{ role: "user", parts: [{ text: "Hello" }] }],
        generationConfig: { maxOutputTokens: 1 }
      });
      setIsKeyValid(true);
    } catch (error) {
       alert("API Key Validation Failed: " + error.message);
       setIsKeyValid(false);
    } finally {
       setIsLoading(false);
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

    if (!isKeyValid) {
      alert("Please connect a valid Gemini API Key first.");
      return;
    }

    const newUserMessage = { role: 'user', content: trimmedInput };
    setMessages((prev) => [...prev, newUserMessage]);
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
        [...messages, newUserMessage],
        (toolName, args) => {
          if (toolName === 'searchDocumentation') setToolStatus(`Searching all Logiwa documentation for "${args.query}"...`);
          if (toolName === 'searchHelpCenter') setToolStatus(`Searching Help Center for "${args.query}"...`);
          if (toolName === 'searchSwagger') setToolStatus(`Searching API Docs for "${args.query}"...`);
          if (toolName === 'rateLimitWait') setToolStatus(`Rate limit exceeded. Waiting ${args.seconds} seconds...`);
          if (toolName === 'geminiModel') setToolStatus(`Asking Gemini (${args.model})...`);
          if (toolName === 'geminiModelFailed') setToolStatus(`Gemini ${args.model} failed — trying next model...`);
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
          approved: false
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
          <div className="logo-container">
            <Zap size={24} color="white" />
          </div>
          <div>
            <div className="logo-text text-gradient">Hyper Consultant</div>
            <div className="logo-sub">Logiwa API Expert v3.1</div>
          </div>
        </div>

        <div style={{ flex: 1 }}>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', lineHeight: 1.5, marginBottom: '2rem' }}>
            I am your advanced AI assistant for the Logiwa API. Ask me anything about endpoints, webhooks, authentication, or LQL filtering.
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
          {isKeyValid ? (
            <div className="api-key-container connected-badge">
              <CheckCircle size={16} color="#4ADE80" />
              <span style={{ color: '#4ADE80', fontSize: '0.85rem', fontWeight: '500' }}>Connected</span>
              <button 
                 onClick={() => { setIsKeyValid(false); setApiKey(''); }}
                 className="disconnect-btn"
                 title="Disconnect API Key"
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
          )}
          <div className="fallback-controls">
            <label className="fallback-toggle" title="If Gemini fails or returns empty, reuse the same Logiwa sources with free Pollinations models">
              <input
                type="checkbox"
                checked={enablePollinationsFallback}
                onChange={(e) => setEnablePollinationsFallback(e.target.checked)}
              />
              <span>Free Pollinations fallback</span>
            </label>
            {enablePollinationsFallback && (
              <input
                type="password"
                className="fallback-key-input"
                placeholder="Optional Pollinations key (enter.pollinations.ai)"
                value={pollinationsKey}
                onChange={(e) => setPollinationsKey(e.target.value)}
                autoComplete="new-password"
                title="Optional. Improves reliability; free key from enter.pollinations.ai"
              />
            )}
          </div>
        </div>

        <div className="chat-container">
          {messages.length === 0 ? (
            <div className="welcome-screen animate-fade-in">
              <Bot className="welcome-icon" />
              <h1 className="welcome-title text-gradient">How can I assist you?</h1>
              <p className="welcome-text">
                Need help integrating with Logiwa? I can search the documentation, generate code snippets, explain complex LQL queries, and even learn from you!
              </p>
              
              <div className="suggested-prompts">
                <button className="prompt-btn" onClick={() => handleSuggestedPrompt("How do I use LQL to filter Serial Tracking by CreatedDate?")}>
                  LQL Date Filtering Example
                </button>
                <button className="prompt-btn" onClick={() => handleSuggestedPrompt("What are the production and sandbox base URLs?")}>
                  API Environments
                </button>
                <button className="prompt-btn" onClick={() => handleSuggestedPrompt("Give me a list of available webhooks.")}>
                  Available Webhooks
                </button>
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
                        <ReactMarkdown className="markdown-body">{msg.content}</ReactMarkdown>
                        
                        {/* Knowledge Proposal Card */}
                        {msg.proposedKnowledge && (
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
              placeholder="Ask anything about Logiwa APIs..."
              value={input}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              rows={1}
            />
            <button 
              className="send-btn" 
              onClick={handleSend}
              disabled={!input.trim() || isLoading}
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
