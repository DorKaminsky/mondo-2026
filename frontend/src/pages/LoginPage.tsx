import { useState, FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

export function LoginPage() {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(email, password);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setError(msg ?? 'Login failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="page" style={{ paddingTop: 48, paddingBottom: 48 }}>
      <div style={{ textAlign: 'center', marginBottom: 28 }}>
        <div style={{
          width: 80, height: 80, borderRadius: '50%',
          background: 'rgba(255,255,255,0.15)',
          backdropFilter: 'blur(8px)',
          border: '2px solid rgba(255,255,255,0.25)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 40, margin: '0 auto 16px',
        }}>⚽</div>
        <h1 style={{ fontSize: 28, fontWeight: 900, color: 'white' }}>WC2026 Predictions</h1>
        <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.6)', marginTop: 4 }}>Sign in to your account</p>
      </div>

      <div className="card">
        <form onSubmit={handleSubmit}>
          {error && <div className="alert alert-danger">{error}</div>}
          <div className="form-group">
            <label>Email</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)}
              placeholder="you@example.com" required autoComplete="email" />
          </div>
          <div className="form-group">
            <label>Password</label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)}
              placeholder="••••••••" required autoComplete="current-password" />
          </div>
          <button type="submit" className="btn btn-primary" disabled={loading}>
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>
      </div>

      <p style={{ textAlign: 'center', fontSize: 14, marginTop: 16, color: 'rgba(255,255,255,0.7)' }}>
        No account?{' '}
        <Link to="/register" style={{ color: 'var(--accent)', fontWeight: 700 }}>
          Join the pool
        </Link>
      </p>
    </div>
  );
}
