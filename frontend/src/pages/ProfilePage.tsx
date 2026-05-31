import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { leaderboardApi } from '../api';
import { useAuth } from '../contexts/AuthContext';
import { MatchPrediction } from '../types';

const AVATAR_COLORS = [
  '#862633', '#2563eb', '#059669', '#7c3aed',
  '#d97706', '#db2777', '#0891b2', '#65a30d',
];

function avatarColor(name: string) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h);
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length];
}

function PredRow({ pred }: { pred: MatchPrediction }) {
  const isFinished = pred.match_status === 'finished';
  const maxPts = pred.round === 'group' ? 10 : 15;
  const isPerfect = isFinished && pred.points_earned === maxPts;
  const hasPoints = isFinished && pred.points_earned !== null && pred.points_earned !== undefined;

  return (
    <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)' }}>
      <div className="flex-between" style={{ marginBottom: 5 }}>
        <span className="text-muted text-xs">
          {pred.kickoff_time_utc ? format(new Date(pred.kickoff_time_utc), 'MMM d') : ''}
          {' · '}{pred.round?.toUpperCase()}
        </span>
        {hasPoints && (
          <span className={`badge ${isPerfect ? 'badge-gold' : pred.points_earned! > 0 ? 'badge-green' : 'badge-gray'}`}>
            {isPerfect ? '⭐ ' : ''}{pred.points_earned} pts
          </span>
        )}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: 8, alignItems: 'center' }}>
        <span style={{ fontWeight: 600, fontSize: 13 }}>{pred.home_team}</span>
        <span style={{ fontWeight: 800, fontSize: 15, color: 'var(--primary)', padding: '0 4px' }}>
          {pred.team_a_goals}–{pred.team_b_goals}
          {isFinished && (
            <span style={{ fontWeight: 500, fontSize: 11, color: 'var(--text-muted)', marginLeft: 4 }}>
              ({pred.home_score ?? '?'}–{pred.away_score ?? '?'})
            </span>
          )}
        </span>
        <span style={{ fontWeight: 600, fontSize: 13, textAlign: 'right' }}>{pred.away_team}</span>
      </div>
      {pred.is_default && <div className="text-xs text-muted" style={{ marginTop: 4 }}>⚠️ Default prediction</div>}
    </div>
  );
}

export function ProfilePage() {
  const { user, logout } = useAuth();
  const { data, isLoading } = useQuery({ queryKey: ['my-stats'], queryFn: leaderboardApi.me });

  if (isLoading) return <div className="loading"><div className="spinner" /></div>;

  const { score, matchHistory } = data ?? {};

  return (
    <div className="page">
      {/* Profile hero */}
      <div className="hero" style={{ padding: '20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div
            className="avatar"
            style={{ width: 56, height: 56, fontSize: 22, background: user?.name ? avatarColor(user.name) : '#862633', border: '2px solid rgba(255,255,255,0.3)' }}
          >
            {user?.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
          </div>
          <div>
            <div style={{ fontSize: 19, fontWeight: 800, color: 'white', lineHeight: 1.2 }}>{user?.name}</div>
            <div style={{ fontSize: 12, opacity: 0.7, color: 'white', marginTop: 3 }}>{user?.email}</div>
          </div>
        </div>
      </div>

      {/* Stats */}
      {score && (
        <div className="card">
          <p style={{ fontWeight: 700, marginBottom: 12, fontSize: 14 }}>Points Breakdown</p>
          <div className="stats-grid">
            <div className="stat-card" style={{ gridColumn: 'span 2', background: 'linear-gradient(135deg, #fff7ed, #fef3dc)' }}>
              <div className="stat-value" style={{ fontSize: 36 }}>{score.total_points}</div>
              <div className="stat-label">Total Points</div>
            </div>
            <div className="stat-card">
              <div className="stat-value">{score.perfect_matches_count}</div>
              <div className="stat-label">Perfect ⭐</div>
            </div>
            <div className="stat-card">
              <div className="stat-value">{score.pre_tournament_points}</div>
              <div className="stat-label">Pre-Tournament</div>
            </div>
            <div className="stat-card">
              <div className="stat-value">{score.group_stage_points}</div>
              <div className="stat-label">Group Stage</div>
            </div>
            <div className="stat-card">
              <div className="stat-value">{score.knockout_points}</div>
              <div className="stat-label">Knockout</div>
            </div>
          </div>
        </div>
      )}

      {/* Match history */}
      {matchHistory && matchHistory.length > 0 && (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: '13px 16px', fontWeight: 700, fontSize: 14, borderBottom: '1px solid var(--border)' }}>
            Match History
          </div>
          {matchHistory.map(pred => <PredRow key={pred.id} pred={pred} />)}
        </div>
      )}

      <button className="btn btn-secondary" onClick={logout} style={{ marginTop: 16 }}>
        Sign Out
      </button>
    </div>
  );
}
