import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { format, subHours } from 'date-fns';
import { matchesApi, predictionsApi } from '../api';
import { Countdown } from '../components/Countdown';
import { PredictionResult, FirstScorer } from '../types';
import { flag, teamColor } from '../utils/flags';

function GoalStepper({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12 }}>
      <button
        type="button"
        className="btn btn-secondary btn-sm"
        style={{ width: 44, height: 44, padding: 0, borderRadius: '50%', fontSize: 20, fontWeight: 700 }}
        onClick={() => onChange(Math.max(0, value - 1))}
      >–</button>
      <span style={{ fontSize: 36, fontWeight: 900, width: 44, textAlign: 'center', color: 'var(--primary)' }}>{value}</span>
      <button
        type="button"
        className="btn btn-secondary btn-sm"
        style={{ width: 44, height: 44, padding: 0, borderRadius: '50%', fontSize: 20, fontWeight: 700 }}
        onClick={() => onChange(value + 1)}
      >+</button>
    </div>
  );
}

export function MatchPredictPage() {
  const { matchId } = useParams<{ matchId: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const { data: match, isLoading: matchLoading } = useQuery({
    queryKey: ['match', matchId],
    queryFn: () => matchesApi.get(Number(matchId)),
  });

  const { data: existing } = useQuery({
    queryKey: ['prediction', matchId],
    queryFn: () => predictionsApi.forMatch(Number(matchId)),
  });

  const [result, setResult] = useState<PredictionResult>('home');
  const [homeGoals, setHomeGoals] = useState(0);
  const [awayGoals, setAwayGoals] = useState(0);
  const [goalDiff, setGoalDiff] = useState(0);
  const [firstScorer, setFirstScorer] = useState<FirstScorer>('none');
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (existing) {
      setResult(existing.prediction_result);
      setHomeGoals(existing.team_a_goals);
      setAwayGoals(existing.team_b_goals);
      setGoalDiff(existing.goal_difference);
      setFirstScorer(existing.first_scorer);
    }
  }, [existing]);

  const submit = useMutation({
    mutationFn: () => predictionsApi.submit({
      match_id: Number(matchId),
      prediction_result: result,
      team_a_goals: homeGoals,
      team_b_goals: awayGoals,
      goal_difference: goalDiff,
      first_scorer: firstScorer,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['my-predictions'] });
      qc.invalidateQueries({ queryKey: ['prediction', matchId] });
      setSaved(true);
      setTimeout(() => navigate('/predict'), 1200);
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setError(msg ?? 'Failed to save prediction');
    },
  });

  if (matchLoading || !match) {
    return <div className="loading"><div className="spinner" /></div>;
  }

  const deadline = subHours(new Date(match.kickoff_time_utc), 1);
  const isPast = new Date() > deadline || match.status !== 'scheduled';
  const pts = match.round === 'group' ? '2 pts' : '3 pts';
  const homeClr = teamColor(match.home_team);
  const awayClr = teamColor(match.away_team);

  return (
    <div className="page">
      <button
        type="button"
        onClick={() => navigate(-1)}
        style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.85)', fontWeight: 700, fontSize: 15, marginBottom: 14, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}
      >
        ← Back
      </button>

      {/* Match hero card */}
      <div style={{
        borderRadius: 'var(--radius)', overflow: 'hidden', marginBottom: 14,
        boxShadow: 'var(--shadow-lg)',
      }}>
        {/* Dual-color top bar */}
        <div style={{ display: 'flex', height: 8 }}>
          <div style={{ flex: 1, background: homeClr }} />
          <div style={{ flex: 1, background: awayClr }} />
        </div>

        <div style={{ background: 'white', padding: '16px 18px' }}>
          <div className="flex-between" style={{ marginBottom: 14 }}>
            <span className="badge badge-gray" style={{ fontSize: 11 }}>
              {match.round === 'group' ? `Group ${match.group_name?.toUpperCase()}` : match.round.toUpperCase()}
            </span>
            <span className="text-muted text-xs">{format(new Date(match.kickoff_time_utc), 'MMM d, HH:mm')}</span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: 8, alignItems: 'center' }}>
            <div style={{ textAlign: 'center' }}>
              <div className="flag-wave" style={{ fontSize: 42, lineHeight: 1 }}>{flag(match.home_team)}</div>
              <div style={{ fontWeight: 800, fontSize: 15, marginTop: 6, lineHeight: 1.2 }}>{match.home_team}</div>
            </div>
            <div style={{ textAlign: 'center', padding: '0 8px' }}>
              {match.status === 'finished' ? (
                <div style={{ fontWeight: 900, fontSize: 24, color: 'var(--primary)' }}>
                  {match.home_score}–{match.away_score}
                </div>
              ) : (
                <div style={{ color: 'var(--text-muted)', fontWeight: 700 }}>vs</div>
              )}
            </div>
            <div style={{ textAlign: 'center' }}>
              <div className="flag-wave-reverse" style={{ fontSize: 42, lineHeight: 1 }}>{flag(match.away_team)}</div>
              <div style={{ fontWeight: 800, fontSize: 15, marginTop: 6, lineHeight: 1.2 }}>{match.away_team}</div>
            </div>
          </div>

          {!isPast && <div style={{ textAlign: 'center', marginTop: 12 }}><Countdown deadline={deadline} /></div>}
        </div>
      </div>

      {isPast && (
        <div className="alert alert-warning" style={{ marginTop: 0 }}>
          {match.status === 'finished'
            ? `Final score: ${match.home_score} – ${match.away_score}`
            : '⚠️ Prediction deadline has passed'}
        </div>
      )}

      {!isPast && (
        <>
          {/* Bet 1: Match result */}
          <div className="card">
            <div className="bet-label">
              <span className="bet-number">1</span>
              Match Result <span className="badge badge-blue" style={{ marginLeft: 4 }}>{pts}</span>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              {([
                { value: 'home' as PredictionResult, label: match.home_team, clr: homeClr },
                { value: 'draw' as PredictionResult, label: 'Draw', clr: '#6b7280' },
                { value: 'away' as PredictionResult, label: match.away_team, clr: awayClr },
              ]).map(opt => {
                const active = result === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    style={{
                      flex: 1, padding: '10px 4px', borderRadius: 10,
                      border: `2px solid ${active ? opt.clr : 'var(--border)'}`,
                      fontWeight: 700, fontSize: 12, cursor: 'pointer', lineHeight: 1.3,
                      background: active ? opt.clr : 'white',
                      color: active ? 'white' : 'var(--text)',
                      transition: 'all 0.15s',
                    }}
                    onClick={() => setResult(opt.value)}
                  >
                    {opt.value !== 'draw' && (
                      <div style={{ fontSize: 18, marginBottom: 3 }}>
                        {opt.value === 'home' ? flag(match.home_team) : flag(match.away_team)}
                      </div>
                    )}
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Bet 2: Home goals */}
          <div className="card">
            <div className="bet-label">
              <span className="bet-number">2</span>
              <span className="flag-wave" style={{ fontSize: 18 }}>{flag(match.home_team)}</span>
              {match.home_team} Goals
              <span className="badge badge-blue" style={{ marginLeft: 4 }}>{pts}</span>
            </div>
            <GoalStepper value={homeGoals} onChange={setHomeGoals} />
          </div>

          {/* Bet 3: Away goals */}
          <div className="card">
            <div className="bet-label">
              <span className="bet-number">3</span>
              <span className="flag-wave-reverse" style={{ fontSize: 18 }}>{flag(match.away_team)}</span>
              {match.away_team} Goals
              <span className="badge badge-blue" style={{ marginLeft: 4 }}>{pts}</span>
            </div>
            <GoalStepper value={awayGoals} onChange={setAwayGoals} />
          </div>

          {/* Bet 4: Goal difference */}
          <div className="card">
            <div className="bet-label">
              <span className="bet-number">4</span>
              Goal Difference
              <span className="badge badge-blue" style={{ marginLeft: 4 }}>{pts}</span>
            </div>
            <GoalStepper value={goalDiff} onChange={setGoalDiff} />
          </div>

          {/* Bet 5: First scorer */}
          <div className="card">
            <div className="bet-label">
              <span className="bet-number">5</span>
              First Scoring Team
              <span className="badge badge-blue" style={{ marginLeft: 4 }}>{pts}</span>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              {([
                { value: 'home' as FirstScorer, label: match.home_team, emoji: flag(match.home_team), clr: homeClr },
                { value: 'none' as FirstScorer, label: 'No Goals', emoji: '🚫', clr: '#6b7280' },
                { value: 'away' as FirstScorer, label: match.away_team, emoji: flag(match.away_team), clr: awayClr },
              ]).map(opt => {
                const active = firstScorer === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    style={{
                      flex: 1, padding: '10px 4px', borderRadius: 10,
                      border: `2px solid ${active ? opt.clr : 'var(--border)'}`,
                      fontWeight: 700, fontSize: 12, cursor: 'pointer', lineHeight: 1.3,
                      background: active ? opt.clr : 'white',
                      color: active ? 'white' : 'var(--text)',
                      transition: 'all 0.15s',
                    }}
                    onClick={() => setFirstScorer(opt.value)}
                  >
                    <div style={{ fontSize: 18, marginBottom: 3 }}>{opt.emoji}</div>
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="card" style={{ background: 'rgba(255,255,255,0.6)', boxShadow: 'none', border: '1px solid rgba(255,255,255,0.5)' }}>
            <p className="text-sm text-muted">
              Each correct bet earns <strong>{pts}</strong> · max {match.round === 'group' ? 10 : 15} pts · all 5 bets are <strong>independent</strong>
            </p>
          </div>

          {error && <div className="alert alert-danger">{error}</div>}
          {saved && <div className="alert alert-success">✓ Prediction saved!</div>}

          <button
            className={`btn ${saved ? 'btn-success' : 'btn-primary'}`}
            onClick={() => submit.mutate()}
            disabled={submit.isPending || saved}
          >
            {submit.isPending ? 'Saving...' : saved ? '✓ Saved!' : existing ? 'Update Prediction' : 'Save Prediction'}
          </button>
        </>
      )}
    </div>
  );
}
