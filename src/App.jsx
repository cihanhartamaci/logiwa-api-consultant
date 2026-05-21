import { useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import { Bot, Send, User, Zap, Activity, Box, Lock, Key, CheckCircle } from 'lucide-react';
import { generateConsultantResponse } from './services/gemini';
import { GoogleGenerativeAI } from '@google/generative-ai';
import './App.css';

function App() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [apiKey, setApiKey] = useState(() => localStorage.getItem('logiwa_api_key') || '');
  const [isKeyValid, setIsKeyValid] = useState(false);
  const messagesEndRef = useRef(null);
  const textareaRef = useRef(null);

  useEffect(() => {
    localStorage.setItem('logiwa_api_key', apiKey);
  }, [apiKey]);

  useEffect(() => {
    if (apiKey && apiKey.startsWith("AIzaSy")) {
       setIsKeyValid(true);
    }
  }, []);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isLoading]);

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

    try {
      const responseText = await generateConsultantResponse(apiKey, [...messages, newUserMessage]);
      setMessages((prev) => [...prev, { role: 'model', content: responseText }]);
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
    }
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
        </div>

        <div className="chat-container">
          {messages.length === 0 ? (
            <div className="welcome-screen animate-fade-in">
              <Bot className="welcome-icon" />
              <h1 className="welcome-title text-gradient">How can I assist you?</h1>
              <p className="welcome-text">
                Need help integrating with Logiwa? I can generate code snippets, explain complex LQL queries, or guide you through webhook configurations.
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
                      <ReactMarkdown className="markdown-body">{msg.content}</ReactMarkdown>
                    )}
                  </div>
                </div>
              </div>
            ))
          )}
          
          {isLoading && (
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
