import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { useState } from 'react';
import { adminApi, leaguesApi } from '../../api';
import { useAuth } from '../../contexts/AuthContext';

export function AdminDashboard() {
  const { user } = useAuth();
  const isSuper = user?.role === 'super_admin';

  const { data } = useQuery({ queryKey: ['admin-dashboard'], queryFn: adminApi.dashboard });
  const { data: myLeague } = useQuery({ queryKey: ['my-league'], queryFn: leaguesApi.mine });

  const [copied, setCopied] = useState(false);
  function copyCode(code: string) {
    navigator.clipboard.writeText(code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  return (
    <div className="page">
      <header className="header" style={{ position: 'static', borderRadius: 12, marginBottom: 16 }}>
        <h1>{isSuper ? '👑 Super Admin' : '⚙️ Admin Panel'}</h1>
      </header>

      {/* Invite code panel — visible to league admins (and super_admins managing a league) */}
      {myLeague?.invite_code && (
        <div className="card" style={{ marginBottom: 16, background: 'linear-gradient(135deg, #fff7ed, #fef3dc)' }}>
          <p className="text-muted text-sm" style={{ marginBottom: 4 }}>Invite code for <b>{myLeague.name}</b></p>
          <div className="flex-between" style={{ alignItems: 'center' }}>
            <code style={{ fontSize: 24, fontWeight: 800, letterSpacing: '0.2em', fontFamily: 'monospace' }}>
              {myLeague.invite_code}
            </code>
            <button
              className="btn-sm btn-secondary"
              onClick={() => copyCode(myLeague.invite_code!)}
            >
              {copied ? '✓ Copied' : 'Copy'}
            </button>
          </div>
          <p className="text-muted text-xs" style={{ marginTop: 8 }}>
            Share this with friends to let them join.
          </p>
        </div>
      )}

      {data && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 20 }}>
          <div className="card" style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 28, fontWeight: 800, color: 'var(--primary)' }}>{data.users?.total ?? 0}</div>
            <div className="text-muted text-sm">Players</div>
          </div>
          {isSuper && (
            <div className="card" style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 28, fontWeight: 800 }}>{data.leagues?.total ?? 0}</div>
              <div className="text-muted text-sm">Leagues</div>
            </div>
          )}
          <div className="card" style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 28, fontWeight: 800 }}>{data.matches?.finished ?? 0}</div>
            <div className="text-muted text-sm">Matches Played</div>
          </div>
          <div className="card" style={{ textAlign: 'center', border: data.matches?.live > 0 ? '2px solid var(--red)' : undefined }}>
            <div style={{ fontSize: 28, fontWeight: 800, color: 'var(--red)' }}>{data.matches?.live ?? 0}</div>
            <div className="text-muted text-sm">Live Now</div>
          </div>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {isSuper && (
          <Link to="/admin/leagues" className="btn btn-secondary" style={{ textDecoration: 'none' }}>
            🏟️ Manage Leagues
          </Link>
        )}
        <Link to="/admin/matches" className="btn btn-secondary" style={{ textDecoration: 'none' }}>
          ⚽ Enter Match Results
        </Link>
        <Link to="/admin/users" className="btn btn-secondary" style={{ textDecoration: 'none' }}>
          👥 Manage Users
        </Link>
        <Link to="/admin/settings" className="btn btn-secondary" style={{ textDecoration: 'none' }}>
          🔧 System Settings
        </Link>
      </div>
    </div>
  );
}
