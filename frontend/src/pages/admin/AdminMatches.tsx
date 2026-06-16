import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import { matchesApi, adminApi } from '../../api';
import { Match } from '../../types';

type Tab = 'live' | 'upcoming' | 'finished';

function ResultForm({ match, onSave }: { match: Match; onSave: () => void }) {
  const [homeScore, setHomeScore] = useState(match.home_score ?? 0);
  const [awayScore, setAwayScore] = useState(match.away_score ?? 0);
  const [firstScorer, setFirstScorer] = useState<string>(match.first_scorer_team ?? 'none');
  const [status, setStatus] = useState(match.status);
  const qc = useQueryClient();

  const save = useMutation({
    mutationFn: () => adminApi.setMatchResult(match.id, {
      home_score: homeScore, away_score: awayScore,
      first_scorer_team: firstScorer, status,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['matches'] });
      onSave();
    },
  });

  const wasFinished = match.status === 'finished';

  function handleSave() {
    if (wasFinished && status === 'finished') {
      // Re-scoring an already-finished match. Warn the admin.
      const ok = confirm(
        `Re-score ${match.home_team} ${homeScore}-${awayScore} ${match.away_team}?\n\n` +
        `Old score: ${match.home_score}-${match.away_score}, first: ${match.first_scorer_team}\n` +
        `Players' previous points for THIS match will be subtracted, then recalculated.`
      );
      if (!ok) return;
    }
    save.mutate();
  }

  return (
    <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
        <div className="form-group" style={{ marginBottom: 0 }}>
          <label>{match.home_team} Goals</label>
          <input type="number" min={0} value={homeScore} onChange={e => setHomeScore(Number(e.target.value))} />
        </div>
        <div className="form-group" style={{ marginBottom: 0 }}>
          <label>{match.away_team} Goals</label>
          <input type="number" min={0} value={awayScore} onChange={e => setAwayScore(Number(e.target.value))} />
        </div>
      </div>
      <div className="form-group">
        <label>First Scorer</label>
        <select value={firstScorer} onChange={e => setFirstScorer(e.target.value)}>
          <option value="home">{match.home_team}</option>
          <option value="away">{match.away_team}</option>
          <option value="none">No Goals</option>
        </select>
      </div>
      <div className="form-group">
        <label>Status</label>
        <select value={status} onChange={e => setStatus(e.target.value as Match['status'])}>
          <option value="live">Live (no scoring yet)</option>
          <option value="finished">Finished (calculate scores)</option>
        </select>
      </div>
      <button className="btn btn-primary" onClick={handleSave} disabled={save.isPending}>
        {save.isPending ? 'Saving...' : wasFinished ? 'Update & Re-score' : 'Save Result'}
      </button>
      {wasFinished && (
        <p className="text-muted text-xs" style={{ marginTop: 6 }}>
          Editing a finished match: scoring engine subtracts old points and adds new — safe to re-submit.
        </p>
      )}
    </div>
  );
}

export function AdminMatches() {
  const navigate = useNavigate();
  const { data: matches, isLoading } = useQuery({ queryKey: ['matches'], queryFn: matchesApi.all });
  const [expanded, setExpanded] = useState<number | null>(null);
  const [tab, setTab] = useState<Tab>('upcoming');

  const filtered = useMemo(() => {
    const all = matches ?? [];
    // Skip TBD knockout placeholders — admin can't enter results until teams known
    const real = all.filter(m => !m.home_team.startsWith('TBD') && !m.away_team.startsWith('TBD'));
    if (tab === 'live') return real.filter(m => m.status === 'live');
    if (tab === 'finished') {
      // Most-recently-finished first (by kickoff DESC)
      return real.filter(m => m.status === 'finished')
        .sort((a, b) => new Date(b.kickoff_time_utc).getTime() - new Date(a.kickoff_time_utc).getTime());
    }
    // upcoming = scheduled only, sorted by soonest kickoff
    return real.filter(m => m.status === 'scheduled')
      .sort((a, b) => new Date(a.kickoff_time_utc).getTime() - new Date(b.kickoff_time_utc).getTime());
  }, [matches, tab]);

  if (isLoading) return <div className="loading"><div className="spinner" /></div>;

  const counts = {
    live: matches?.filter(m => m.status === 'live').length ?? 0,
    upcoming: matches?.filter(m => m.status === 'scheduled' && !m.home_team.startsWith('TBD') && !m.away_team.startsWith('TBD')).length ?? 0,
    finished: matches?.filter(m => m.status === 'finished').length ?? 0,
  };

  return (
    <div className="page">
      <button onClick={() => navigate('/admin')} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.85)', fontWeight: 600, marginBottom: 12, cursor: 'pointer' }}>← Back</button>
      <h1 style={{ fontSize: 20, marginBottom: 16, color: 'white' }}>⚽ Match Results</h1>

      <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
        {(['upcoming', 'live', 'finished'] as Tab[]).map(t => (
          <button
            key={t}
            onClick={() => { setTab(t); setExpanded(null); }}
            style={{
              flex: 1,
              padding: '8px 10px',
              borderRadius: 999,
              border: 'none',
              background: tab === t ? 'white' : 'rgba(255,255,255,0.15)',
              color: tab === t ? 'var(--primary)' : 'white',
              fontWeight: 700,
              fontSize: 12,
              cursor: 'pointer',
              textTransform: 'capitalize',
            }}
          >
            {t} ({counts[t]})
          </button>
        ))}
      </div>

      {filtered.length === 0 && (
        <div className="card" style={{ textAlign: 'center', padding: 20 }}>
          <p className="text-muted">No matches in this tab.</p>
        </div>
      )}

      {filtered.map(match => (
        <div key={match.id} className="card">
          <div className="flex-between">
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontWeight: 600 }}>
                {match.home_team} {match.status === 'finished' && (
                  <span style={{ color: 'var(--primary)', fontWeight: 800 }}>{match.home_score}–{match.away_score}</span>
                )}
                {match.status !== 'finished' && 'vs'} {match.away_team}
              </div>
              <div className="text-muted text-sm">
                {format(new Date(match.kickoff_time_utc), 'MMM d, HH:mm')} — {match.round.toUpperCase()}
                {match.first_scorer_team && match.status === 'finished' && (
                  <> · 1st: {match.first_scorer_team === 'home' ? match.home_team : match.first_scorer_team === 'away' ? match.away_team : 'none'}</>
                )}
              </div>
            </div>
            <span
              className={`badge ${
                match.status === 'live' ? 'badge-red'
                : match.status === 'finished' ? 'badge-green'
                : 'badge-gray'
              }`}
            >
              {match.status}
            </span>
          </div>
          <button
            className="btn btn-secondary btn-sm"
            style={{ marginTop: 10, width: 'auto' }}
            onClick={() => setExpanded(expanded === match.id ? null : match.id)}
          >
            {expanded === match.id ? '▲ Close' : match.status === 'finished' ? '✏️ Edit Result' : '✏️ Enter Result'}
          </button>
          {expanded === match.id && (
            <ResultForm match={match} onSave={() => setExpanded(null)} />
          )}
        </div>
      ))}
    </div>
  );
}
