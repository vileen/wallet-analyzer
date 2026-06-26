import { useState } from 'react';
import { auth } from '../api/client';

export default function Login({ onLogin }: { onLogin: () => void }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      await auth.login(password);
      onLogin();
    } catch {
      setError('Invalid password');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      height: '100vh',
      gap: '1rem',
    }}>
      <h1 style={{ fontSize: '1.5rem', fontWeight: 600 }}>Solana Wallet Tracker</h1>
      <form onSubmit={handleSubmit} style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '0.75rem',
        width: '300px',
      }}>
        <input
          type="password"
          placeholder="Enter password"
          value={password}
          onChange={e => setPassword(e.target.value)}
          style={{
            padding: '0.75rem 1rem',
            borderRadius: '8px',
            border: '1px solid #333',
            background: '#1a1a1a',
            color: '#e0e0e0',
            fontSize: '1rem',
          }}
        />
        {error && <span style={{ color: '#ff4444', fontSize: '0.875rem' }}>{error}</span>}
        <button
          type="submit"
          disabled={loading}
          style={{
            padding: '0.75rem',
            borderRadius: '8px',
            border: 'none',
            background: '#512da8',
            color: 'white',
            fontSize: '1rem',
            cursor: loading ? 'not-allowed' : 'pointer',
            opacity: loading ? 0.7 : 1,
          }}
        >
          {loading ? 'Loading...' : 'Login'}
        </button>
      </form>
    </div>
  );
}
