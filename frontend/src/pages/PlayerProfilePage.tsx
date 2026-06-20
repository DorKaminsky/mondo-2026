import { useQuery } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import { format } from 'date-fns';
import { leaderboardApi } from '../api';
import { avatarColor, flag, initials } from '../utils/flags';
import { MatchPrediction, PreTournamentPrediction } from '../types';

const GROUPS = ['a','b','c','d','e','f','g','h','i','j','k','l'] as const;

function PreTournamentBlock({ pt }: { pt: PreTournamentPrediction | null }) {
  if (!pt) {
    return (
      <div className="card" style={{ textAlign: 'center', padding: 16 }}>
        <p className="text-muted text-sm">No pre-tournament predictions submitted.</p>
      </div>
    );
  }
  const grand: [string, string | null][] = [
    ['🏆 Winner', pt.winner_team],
    ['🥈 Runner-up', pt.runner_up_team],
    ['⚽ Top Scorer', pt.top_scorer_name],
    ['🅰️ Top Assister', pt.top_assister_name],
  ];
  return (
    <div className="card">
      <h3 style={{ marginBottom: 12 }}>Pre-Tournament</h3>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 14 }}>
        {grand.map(([label, val]) => (
          <div key={label} style={{ background: 'var(--surface-2, rgba(0,0,0,0.04))', padding: 10, borderRadius: 8 }}>
            <div className="text-xs text-muted" style={{ marginBottom: 4 }}>{label}</div>
            <div style={{ fontWeight: 700, fontSize: 13 }}>{val || '—'}</div>
          </div>
        ))}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
        {GROUPS.map(g => {
          const first = (pt as unknown as Record<string, string>)[`group_${g}_first`];
          const second = (pt as unknown as Record<string, string>)[`group_${g}_second`];
          return (
            <div key={g} style={{ background: 'var(--surface-2, rgba(0,0,0,0.04))', padding: 8, borderRadius: 8 }}>
              <div className="text-xs" style={{ fontWeight: 700, marginBottom: 4 }}>Group {g.toUpperCase()}</div>
              <div style={{ fontSize: 12 }}>1️⃣ {first || '—'}</div>
              <div style={{ fontSize: 12 }}>2️⃣ {second || '—'}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function MatchHistoryRow({ p }: { p: MatchPrediction }) {
  const correct = p.points_earned != null && p.points_earned > 0;
  return (
    <div className="card" style={{ padding: 12, marginBottom: 8 }}>
      <div className="flex-between" style={{ marginBottom: 6 }}>
        <span className="text-xs text-muted">
          {p.kickoff_time_utc && format(new Date(p.kickoff_time_utc), 'MMM d')} · {p.round?.toUpperCase()}
        </span>
        <span className={`badge ${correct ? 'badge-green' : p.points_earned === 0 ? 'badge-gray' : 'badge-blue'}`}>
          {p.points_earned != null ? `+${p.points_earned} pts` : '—'}
        </span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: 8, alignItems: 'center', fontSize: 13 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 18 }}>{flag(p.home_team || '')}</span>
          <span style={{ fontWeight: 600 }}>{p.home_team}</span>
        </div>
        <div style={{ textAlign: 'center', fontWeight: 800, color: 'var(--primary)' }}>
          {p.home_score}–{p.away_score}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'flex-end' }}>
          <span style={{ fontWeight: 600 }}>{p.away_team}</span>
          <span style={{ fontSize: 18 }}>{flag(p.away_team || '')}</span>
        </div>
      </div>
      <div className="text-xs text-muted" style={{ marginTop: 6 }}>
        Predicted: <b>{p.team_a_goals}–{p.team_b_goals}</b>
        {p.first_scorer && <> · 1st: <b>{p.first_scorer === 'home' ? p.home_team : p.first_scorer === 'away' ? p.away_team : 'no goals'}</b></>}
        {p.is_default && <> · <span style={{ color: 'var(--text-muted)' }}>(default)</span></>}
      </div>
    </div>
  );
}

export function PlayerProfilePage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const userId = Number(id);

  const { data, isLoading, error } = useQuery({
    queryKey: ['player', userId],
    queryFn: () => leaderboardApi.player(userId),
    enabled: Number.isFinite(userId),
  });

  if (isLoading) return <div className="loading"><div className="spinner" /></div>;
  if (error || !data) {
    return (
      <div className="page">
        <button onClick={() => navigate(-1)} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.85)', fontWeight: 600, marginBottom: 12, cursor: 'pointer' }}>← Back</button>
        <div className="card" style={{ textAlign: 'center', padding: 24 }}>
          <p className="text-muted">Player not found in your league.</p>
        </div>
      </div>
    );
  }

  const { player, score, preTournament, matchHistory } = data;

  const finished = matchHistory.filter(p => p.points_earned !== null);
  const total = finished.length;

  function actualResult(h: number, a: number) {
    return h > a ? 'home' : h < a ? 'away' : 'draw';
  }

  const correctResults = finished.filter(p =>
    p.home_score != null && p.away_score != null &&
    p.prediction_result === actualResult(p.home_score, p.away_score)
  ).length;
  const exactScores = finished.filter(p =>
    p.team_a_goals === p.home_score && p.team_b_goals === p.away_score
  ).length;
  const totalWithFs = finished.filter(p => p.first_scorer_team != null).length;
  const correctFs = finished.filter(p =>
    p.first_scorer_team != null && p.first_scorer === p.first_scorer_team
  ).length;
  const correctDiff = finished.filter(p =>
    p.home_score != null && p.away_score != null &&
    p.goal_difference === Math.abs(p.home_score - p.away_score)
  ).length;
  const ptsPerMatch = total > 0
    ? (finished.reduce((s, p) => s + (p.points_earned ?? 0), 0) / total).toFixed(1)
    : null;

  const pct = (n: number, d: number) => d > 0 ? Math.round(n / d * 100) + '%' : '—';
  const last5 = finished.slice(0, 5);
  const bestMatch = finished.length > 0
    ? finished.reduce((best, p) => (p.points_earned ?? 0) > (best.points_earned ?? 0) ? p : best)
    : null;

  return (
    <div className="page">
      <button onClick={() => navigate(-1)} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.85)', fontWeight: 600, marginBottom: 12, cursor: 'pointer' }}>← Back</button>

      {/* Header */}
      <div className="card" style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 12 }}>
        <div className="avatar" style={{ background: avatarColor(player.name), width: 56, height: 56, fontSize: 20 }}>
          {initials(player.name)}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 800, fontSize: 18 }}>{player.name}</div>
          {score && (
            <div className="text-sm text-muted" style={{ marginTop: 2 }}>
              <b style={{ color: 'var(--primary)' }}>{score.total_points} pts</b>
              {' · '}{score.perfect_matches_count} perfect ⭐
            </div>
          )}
        </div>
      </div>

      {/* Stat pills — only show when there are finished matches */}
      {total > 0 && (
        <div className="card" style={{ marginBottom: 12 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10, marginBottom: last5.length > 0 ? 14 : 0 }}>
            {[
              { label: '🎯 Result %', value: pct(correctResults, total), sub: `${correctResults}/${total}` },
              { label: '⚽ Exact Score %', value: pct(exactScores, total), sub: `${exactScores}/${total}` },
              { label: '🥅 First Scorer %', value: pct(correctFs, totalWithFs), sub: `${correctFs}/${totalWithFs}` },
              { label: '📐 Goal Diff %', value: pct(correctDiff, total), sub: `${correctDiff}/${total}` },
            ].map(s => (
              <div key={s.label} style={{ background: 'var(--surface-2, rgba(0,0,0,0.04))', padding: '10px 12px', borderRadius: 8 }}>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>{s.label}</div>
                <div style={{ fontWeight: 800, fontSize: 18, color: 'var(--primary)' }}>{s.value}</div>
                <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{s.sub} correct</div>
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
            {ptsPerMatch && (
              <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                🔥 <b style={{ color: 'var(--primary)' }}>{ptsPerMatch}</b> pts/match avg
              </div>
            )}
            {bestMatch && (
              <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                ⭐ Best match: <b style={{ color: 'var(--primary)' }}>{bestMatch.home_team} vs {bestMatch.away_team}</b> (+{bestMatch.points_earned} pts)
              </div>
            )}
          </div>
          {/* Last 5 trend */}
          {last5.length > 0 && (
            <div style={{ marginTop: 12 }}>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6 }}>Last {last5.length} matches</div>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                {last5.map((p, i) => {
                  const pts = p.points_earned ?? 0;
                  const bg = p.is_default ? '#e8a020' : pts > 0 ? 'var(--primary)' : '#e53e3e';
                  return (
                    <div key={i} title={`${p.home_team} vs ${p.away_team}: +${pts} pts`} style={{
                      width: 28, height: 28, borderRadius: '50%', background: bg,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 10, fontWeight: 800, color: 'white',
                    }}>
                      {pts}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      <PreTournamentBlock pt={preTournament} />

      <h3 style={{ color: 'white', fontSize: 16, margin: '20px 0 10px' }}>
        Match History {matchHistory.length > 0 && <span className="text-muted text-sm" style={{ fontWeight: 400 }}>· {matchHistory.length} finished</span>}
      </h3>
      {matchHistory.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: 16 }}>
          <p className="text-muted text-sm">No finished matches yet.</p>
        </div>
      ) : (
        matchHistory.map(p => <MatchHistoryRow key={p.id} p={p} />)
      )}
    </div>
  );
}
