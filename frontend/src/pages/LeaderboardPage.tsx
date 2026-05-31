import { useQuery } from '@tanstack/react-query';
import { leaderboardApi } from '../api';
import { useAuth } from '../contexts/AuthContext';

const AVATAR_COLORS = [
  '#862633', '#2563eb', '#059669', '#7c3aed',
  '#d97706', '#db2777', '#0891b2', '#65a30d',
];

function avatarColor(name: string) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h);
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length];
}

function initials(name: string) {
  return name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();
}

export function LeaderboardPage() {
  const { user } = useAuth();
  const { data, isLoading } = useQuery({ queryKey: ['leaderboard'], queryFn: leaderboardApi.all });

  if (isLoading) return <div className="loading"><div className="spinner" /></div>;

  const board = data?.leaderboard ?? [];
  const top3 = board.slice(0, 3);
  const rest = board.slice(3);

  return (
    <div className="page">
      {/* Hero podium */}
      <div className="hero" style={{ padding: '20px 20px 28px' }}>
        <div style={{ fontSize: 11, fontWeight: 700, opacity: 0.7, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 16 }}>
          Standings
        </div>
        {top3.length > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.1fr 1fr', gap: 8, alignItems: 'flex-end' }}>
            {/* 2nd place */}
            {top3[1] ? (
              <div style={{ textAlign: 'center', opacity: top3[1].id === user?.id ? 1 : 0.92 }}>
                <div className="avatar" style={{ background: avatarColor(top3[1].name), margin: '0 auto 6px', width: 44, height: 44, fontSize: 16 }}>
                  {initials(top3[1].name)}
                </div>
                <div style={{ fontSize: 12, fontWeight: 700, color: 'rgba(255,255,255,0.9)', marginBottom: 2 }}>
                  {top3[1].name.split(' ')[0]}
                </div>
                <div style={{ background: 'rgba(255,255,255,0.2)', borderRadius: '8px 8px 0 0', padding: '10px 4px' }}>
                  <div style={{ fontSize: 22, fontWeight: 900, color: 'var(--silver)' }}>🥈</div>
                  <div style={{ fontSize: 15, fontWeight: 800, color: 'white' }}>{top3[1].total_points}</div>
                  <div style={{ fontSize: 10, opacity: 0.7, color: 'white' }}>pts</div>
                </div>
              </div>
            ) : <div />}

            {/* 1st place */}
            {top3[0] && (
              <div style={{ textAlign: 'center', opacity: top3[0].id === user?.id ? 1 : 0.95 }}>
                <div style={{ fontSize: 20, marginBottom: 4 }}>👑</div>
                <div className="avatar" style={{ background: avatarColor(top3[0].name), margin: '0 auto 6px', width: 52, height: 52, fontSize: 18 }}>
                  {initials(top3[0].name)}
                </div>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'white', marginBottom: 2 }}>
                  {top3[0].name.split(' ')[0]}
                </div>
                <div style={{ background: 'rgba(255,255,255,0.25)', borderRadius: '8px 8px 0 0', padding: '12px 4px' }}>
                  <div style={{ fontSize: 24, fontWeight: 900, color: 'var(--gold)' }}>🥇</div>
                  <div style={{ fontSize: 18, fontWeight: 900, color: 'white' }}>{top3[0].total_points}</div>
                  <div style={{ fontSize: 10, opacity: 0.7, color: 'white' }}>pts</div>
                </div>
              </div>
            )}

            {/* 3rd place */}
            {top3[2] ? (
              <div style={{ textAlign: 'center', opacity: top3[2].id === user?.id ? 1 : 0.88 }}>
                <div className="avatar" style={{ background: avatarColor(top3[2].name), margin: '0 auto 6px', width: 40, height: 40, fontSize: 15 }}>
                  {initials(top3[2].name)}
                </div>
                <div style={{ fontSize: 12, fontWeight: 700, color: 'rgba(255,255,255,0.85)', marginBottom: 2 }}>
                  {top3[2].name.split(' ')[0]}
                </div>
                <div style={{ background: 'rgba(255,255,255,0.15)', borderRadius: '8px 8px 0 0', padding: '8px 4px' }}>
                  <div style={{ fontSize: 20, fontWeight: 900, color: '#cd7f32' }}>🥉</div>
                  <div style={{ fontSize: 14, fontWeight: 800, color: 'white' }}>{top3[2].total_points}</div>
                  <div style={{ fontSize: 10, opacity: 0.7, color: 'white' }}>pts</div>
                </div>
              </div>
            ) : <div />}
          </div>
        )}
      </div>

      {/* Full list */}
      {rest.length > 0 && (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          {rest.map((entry, i) => {
            const rank = i + 4;
            const isMe = entry.id === user?.id;
            return (
              <div
                key={entry.id}
                className={isMe ? 'rank-me' : ''}
                style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  padding: '12px 16px',
                  borderTop: '1px solid var(--border)',
                }}
              >
                <span style={{ width: 28, fontWeight: 700, fontSize: 14, color: 'var(--text-muted)', textAlign: 'center' }}>
                  #{rank}
                </span>
                <div className="avatar" style={{ background: avatarColor(entry.name), width: 36, height: 36, fontSize: 13 }}>
                  {initials(entry.name)}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>
                    {entry.name}{isMe ? ' 👈' : ''}
                  </div>
                  <div className="text-xs text-muted">{entry.perfect_matches_count} perfect ⭐</div>
                </div>
                <div style={{ fontWeight: 800, fontSize: 17, color: 'var(--primary)' }}>{entry.total_points}</div>
              </div>
            );
          })}
        </div>
      )}

      {board.length === 0 && (
        <div className="card" style={{ textAlign: 'center', padding: 32, color: 'var(--text-muted)' }}>
          No scores yet — tournament hasn't started!
        </div>
      )}
    </div>
  );
}
