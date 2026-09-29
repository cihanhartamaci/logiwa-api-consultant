import { useState } from 'react';
import { Key, Lock, User } from 'lucide-react';
import logiwaLogo from '../assets/logiwa-logo.png';

export const AUTH_STORAGE_KEY = 'aintegration_signed_in';
const LOGIN_USERNAME = 'integrationsteam';
const LOGIN_PASSWORD = 'Integration.2026';

export default function LoginScreen({ onSuccess }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = (event) => {
    event.preventDefault();
    if (username.trim() === LOGIN_USERNAME && password === LOGIN_PASSWORD) {
      localStorage.setItem(AUTH_STORAGE_KEY, '1');
      onSuccess();
      return;
    }
    setError('Invalid username or password.');
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
            onChange={(e) => {
              setPassword(e.target.value);
              setError('');
            }}
          />
        </label>

        {error && <p className="login-error">{error}</p>}

        <button type="submit" className="login-submit">
          <Key size={16} />
          Sign in
        </button>
      </form>
      <p className="app-credit">Created by cihanhartamaci with help from Cursor.</p>
    </div>
  );
}
