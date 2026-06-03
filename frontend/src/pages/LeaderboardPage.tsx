import { useQuery } from '@tanstack/react-query';
import { leaderboardApi } from '../api';
import { useAuth } from '../contexts/AuthContext';
import { avatarColor, initials } from '../utils/flags';

export function LeaderboardPage() {
  const { user } = useAuth();
  const { data, isLoading } = useQuery({ queryKey: ['leaderboard'], queryFn: leaderboardApi.all });

  if (isLoading) return <div className="loading"><div className="spinner" /></div>;

  const board = data?.leaderboard ?? [];
  const top3 = board.slice(0, 3);
  const rest = board.slice(3);

  // Tournament has "started" once at least one match has been finished by admin.
  // Even if everyone has 0 pts, we still want to show the regular standings layout —
  // an all-zeros podium is visually weird, but a list with 0s is fine and informative.
  // We treat the tournament as started if any player has a non-zero score, OR if
  // the user explicitly wants the standings table (we just always show it now).
  const tournamentStarted = board.some(e => e.total_points > 0);

  if (board.length === 0) {
    return (
      <div className="page">
        <h1 style={{ fontSize: 22, fontWeight: 900, color: 'white', marginBottom: 16 }}>Standings</h1>
        <div className="card" style={{ textAlign: 'center', padding: 32 }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>🏟️</div>
          <p style={{ fontWeight: 700, fontSize: 16, marginBottom: 6 }}>No players yet</p>
          <p className="text-muted text-sm">Share your league invite code so friends can join.</p>
        </div>
      </div>
    );
  }

  if (!tournamentStarted) {
    // No match results entered yet — show a roster preview but still acknowledge it's the standings page.
    return (
      <div className="page">
        <h1 style={{ fontSize: 22, fontWeight: 900, color: 'white', marginBottom: 16 }}>Standings</h1>
        <div className="card" style={{ textAlign: 'center', padding: 24 }}>
          <div style={{ fontSize: 32, marginBottom: 8 }}>⚽</div>
          <p style={{ fontWeight: 700, fontSize: 15, marginBottom: 4 }}>Tournament hasn't started</p>
          <p className="text-muted text-sm" style={{ marginBottom: 14 }}>
            Standings appear once results are entered.
          </p>
        </div>
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', fontWeight: 700, fontSize: 13, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            {board.length} {board.length === 1 ? 'player' : 'players'} in your league
          </div>
          {board.map((entry, i) => (
            <div
              key={entry.id}
              className={entry.id === user?.id ? 'rank-me' : ''}
              style={{
                display: 'flex', alignItems: 'center', gap: 12,
                padding: '12px 16px',
                borderTop: i > 0 ? '1px solid var(--border)' : 'none',
              }}
            >
              <span style={{ width: 24, fontWeight: 700, fontSize: 14, color: 'var(--text-muted)', textAlign: 'center' }}>
                #{i + 1}
              </span>
              <div className="avatar" style={{ background: avatarColor(entry.name), width: 36, height: 36, fontSize: 13 }}>
                {initials(entry.name)}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, fontSize: 14 }}>
                  {entry.name}{entry.id === user?.id ? ' 👈' : ''}
                </div>
                <div className="text-xs text-muted">0 perfect ⭐</div>
              </div>
              <div style={{ fontWeight: 800, fontSize: 17, color: 'var(--text-muted)' }}>0</div>
            </div>
          ))}
        </div>
      </div>
    );
  }

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
    </div>
  );
}
