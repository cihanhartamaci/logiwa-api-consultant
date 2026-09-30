import { useState } from 'react';
import { Key, Lock, User } from 'lucide-react';
import logiwaLogo from '../assets/logiwa-logo.png';
import { isKbApiConfigured, loginWithKbApi, saveSession } from '../services/kbApi';

const LOCAL_FALLBACK_USERNAME = 'integrationsteam';
const LOCAL_FALLBACK_PASSWORD = 'Integration.2026';

export default function LoginScreen({ onSuccess }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');
    setBusy(true);
    try {
      if (isKbApiConfigured()) {
        await loginWithKbApi(username.trim(), password);
        onSuccess();
        return;
      }
      if (username.trim() === LOCAL_FALLBACK_USERNAME && password === LOCAL_FALLBACK_PASSWORD) {
        saveSession({
          token: 'local-dev-token',
          expiresAt: new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString(),
        });
        onSuccess();
        return;
      }
      setError('Invalid username or password.');
    } catch (err) {
      console.error(err);
      setError(err?.message || 'Invalid username or password.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="login-screen">
      <form className="login-card" onSubmit={handleSubmit}>
        <img src={logiwaLogo} alt="Logiwa" className="login-logo" />
        <h1 className="login-title text-gradient">AIntegration</h1>
        <p className="login-copy">Sign in to continue to the Logiwa API assistant.</p>

        <label className="login-field">
          <User size={16} />
          <input
            type="text"
            name="username"
            autoComplete="username"
            placeholder="Username"
            value={username}
            disabled={busy}
            onChange={(e) => {
              setUsername(e.target.value);
              setError('');
            }}
          />
        </label>

        <label className="login-field">
          <Lock size={16} />
          <input
            type="password"
            name="password"
            autoComplete="current-password"
            placeholder="Password"
            value={password}
            disabled={busy}
            onChange={(e) => {
              setPassword(e.target.value);
              setError('');
            }}
          />
        </label>

        {error && <p className="login-error">{error}</p>}

        <button type="submit" className="login-submit" disabled={busy}>
          <Key size={16} />
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
      <p className="app-credit">Created by cihanhartamaci with help from Cursor.</p>
    </div>
  );
}
