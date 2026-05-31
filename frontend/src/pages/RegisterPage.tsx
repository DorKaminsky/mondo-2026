import { useState, FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { authApi } from '../api';
import { useAuth } from '../contexts/AuthContext';

export function RegisterPage() {
  const navigate = useNavigate();
  const { setUser } = useAuth();
  const [formData, setFormData] = useState({
    name: '', email: '', password: '', confirm: '', invite_code: '',
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleRegister(e: FormEvent) {
    e.preventDefault();
    if (formData.password !== formData.confirm) { setError('Passwords do not match'); return; }
    setError(''); setLoading(true);
    try {
      const code = formData.invite_code.trim().toUpperCase();
      const { token, user } = await authApi.register({
        name: formData.name,
        email: formData.email,
        password: formData.password,
        // Send invite_code only if filled — server accepts empty for the very first user
        ...(code ? { invite_code: code } : {}),
      });
      localStorage.setItem('token', token);
      setUser(user);
      navigate('/');
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setError(msg ?? 'Registration failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="page" style={{ paddingTop: 40, paddingBottom: 48 }}>
      <div style={{ textAlign: 'center', marginBottom: 24 }}>
        <div style={{ fontSize: 40, marginBottom: 10 }}>🏆</div>
        <h1 style={{ fontSize: 26, fontWeight: 900, color: 'white' }}>Join the Pool</h1>
        <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)', marginTop: 4 }}>
          Enter your league invite code to get started
        </p>
      </div>
      <div className="card">
        <form onSubmit={handleRegister}>
          {error && <div className="alert alert-danger">{error}</div>}
          <div className="form-group">
            <label>League Invite Code</label>
            <input
              value={formData.invite_code}
              onChange={e => setFormData(p => ({ ...p, invite_code: e.target.value.toUpperCase() }))}
              placeholder="e.g. AB12CD"
              maxLength={6}
              autoCapitalize="characters"
              style={{ textTransform: 'uppercase', letterSpacing: '0.15em', fontFamily: 'monospace' }}
            />
            <p className="text-muted text-xs mt-4">
              Get this from your league admin. Leave empty only if you're the first user.
            </p>
          </div>
          <div className="form-group">
            <label>Name</label>
            <input value={formData.name} onChange={e => setFormData(p => ({ ...p, name: e.target.value }))}
              placeholder="Your name" required minLength={2} />
          </div>
          <div className="form-group">
            <label>Email</label>
            <input type="email" value={formData.email}
              onChange={e => setFormData(p => ({ ...p, email: e.target.value }))}
              placeholder="you@example.com" required />
          </div>
          <div className="form-group">
            <label>Password</label>
            <input type="password" value={formData.password}
              onChange={e => setFormData(p => ({ ...p, password: e.target.value }))}
              placeholder="Min 8 characters" required minLength={8} />
          </div>
          <div className="form-group">
            <label>Confirm Password</label>
            <input type="password" value={formData.confirm}
              onChange={e => setFormData(p => ({ ...p, confirm: e.target.value }))}
              placeholder="Repeat password" required />
          </div>
          <button type="submit" className="btn btn-primary" disabled={loading}>
            {loading ? 'Creating account...' : 'Create Account'}
          </button>
        </form>
      </div>
      <p style={{ textAlign: 'center', fontSize: 14, marginTop: 16, color: 'rgba(255,255,255,0.7)' }}>
        Already registered?{' '}
        <Link to="/login" style={{ color: 'var(--accent)', fontWeight: 700 }}>Sign In</Link>
      </p>
    </div>
  );
}
