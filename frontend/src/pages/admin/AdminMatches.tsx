import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import { matchesApi, adminApi } from '../../api';
import { Match } from '../../types';

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
          <option value="live">Live</option>
          <option value="finished">Finished (calculate scores)</option>
        </select>
      </div>
      <button className="btn btn-primary" onClick={() => save.mutate()} disabled={save.isPending}>
        {save.isPending ? 'Saving...' : 'Save Result'}
      </button>
    </div>
  );
}

export function AdminMatches() {
  const navigate = useNavigate();
  const { data: matches, isLoading } = useQuery({ queryKey: ['matches'], queryFn: matchesApi.all });
  const [expanded, setExpanded] = useState<number | null>(null);

  if (isLoading) return <div className="loading"><div className="spinner" /></div>;

  const unfinished = matches?.filter(m => m.status !== 'finished') ?? [];

  return (
    <div className="page">
      <button onClick={() => navigate('/admin')} style={{ background: 'none', border: 'none', color: 'var(--primary)', fontWeight: 600, marginBottom: 12, cursor: 'pointer' }}>← Back</button>
      <h1 style={{ fontSize: 20, marginBottom: 16 }}>⚽ Match Results</h1>

      {unfinished.map(match => (
        <div key={match.id} className="card">
          <div className="flex-between">
            <div>
              <div style={{ fontWeight: 600 }}>{match.home_team} vs {match.away_team}</div>
              <div className="text-muted text-sm">
                {format(new Date(match.kickoff_time_utc), 'MMM d, HH:mm')} — {match.round.toUpperCase()}
              </div>
            </div>
            <span className={`badge ${match.status === 'live' ? 'badge-red' : 'badge-gray'}`}>
              {match.status}
            </span>
          </div>
          <button
            className="btn btn-secondary btn-sm"
            style={{ marginTop: 10, width: 'auto' }}
            onClick={() => setExpanded(expanded === match.id ? null : match.id)}
          >
            {expanded === match.id ? '▲ Close' : '✏️ Enter Result'}
          </button>
          {expanded === match.id && (
            <ResultForm match={match} onSave={() => setExpanded(null)} />
          )}
        </div>
      ))}
    </div>
  );
}
