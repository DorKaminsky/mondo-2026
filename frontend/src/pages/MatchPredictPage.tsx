import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { format, subHours } from 'date-fns';
import { matchesApi, predictionsApi } from '../api';
import { localTimezoneLabel } from '../utils/flags';
import { CalendarReminder } from '../components/CalendarReminder';
import { Countdown } from '../components/Countdown';
import { PredictionResult, FirstScorer } from '../types';
import { flag, teamColor, teamShort, avatarColor, initials } from '../utils/flags';

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

// Compact label/value cell for the per-player prediction grid
function Field({ label, value, flag }: { label: string; value: string; flag?: string }) {
  return (
    <div style={{
      background: 'var(--green-light)',
      borderRadius: 6,
      padding: '5px 2px',
      textAlign: 'center',
      minWidth: 0,
    }}>
      <div style={{
        fontSize: 9,
        fontWeight: 700,
        color: 'var(--text-muted)',
        textTransform: 'uppercase',
        letterSpacing: '0.04em',
        marginBottom: 3,
      }}>{label}</div>
      <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--primary)', display: 'flex', gap: 2, justifyContent: 'center', alignItems: 'center', lineHeight: 1.1 }}>
        {flag && <span style={{ fontSize: 13 }}>{flag}</span>}
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{value}</span>
      </div>
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

  // All league predictions for this match — only populated after deadline
  const { data: allPredictions } = useQuery({
    queryKey: ['all-predictions', matchId],
    queryFn: () => predictionsApi.allForMatch(Number(matchId)),
    refetchInterval: 30_000, // refresh every 30s in case the match was just scored
  });

  // For "next match" navigation — load all matches
  const { data: allMatches } = useQuery({ queryKey: ['matches'], queryFn: matchesApi.all });

  const [result, setResult] = useState<PredictionResult>('home');
  const [homeGoals, setHomeGoals] = useState(0);
  const [awayGoals, setAwayGoals] = useState(0);
  const [goalDiff, setGoalDiff] = useState(0);
  const [firstScorer, setFirstScorer] = useState<FirstScorer>('none');
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');
  // Diff-mismatch confirmation modal: stores the expectedDiff for the message,
  // null = modal hidden.
  const [diffWarning, setDiffWarning] = useState<{ expected: number } | null>(null);
  // Snapshot of the next match's id, used by the post-save redirect.
  // Updated on every render once we've computed nextMatch below.
  const nextMatchAtSubmit = useRef<number | null>(null);

  // Reset form state whenever the URL :matchId changes. Without this, navigating
  // between matches (via the "Next match" button or post-save redirect) carries
  // over the previous match's selections AND leaves the "✓ Saved!" flag visible
  // on the new page until the user touches something.
  useEffect(() => {
    setSaved(false);
    setError('');
    setResult('home');
    setHomeGoals(0);
    setAwayGoals(0);
    setGoalDiff(0);
    setFirstScorer('none');
  }, [matchId]);

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
      // After save, jump to the next un-predicted match if one exists; otherwise
      // back to the predict list. Computed at click-time via a closure-stable ref.
      setTimeout(() => {
        if (nextMatchAtSubmit.current) {
          navigate(`/predict/${nextMatchAtSubmit.current}`);
        } else {
          navigate('/predict');
        }
      }, 1200);
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setError(msg ?? 'Failed to save prediction');
    },
  });

  // Players sometimes set goal_difference inconsistently with the home/away
  // counts they entered. The diff is intentionally a separate dimension (you
  // can bet 2-1 result but diff=3, etc.), so we don't auto-correct — but we
  // do warn so unintentional mismatches don't silently cost points.
  function handleSubmitClick() {
    const expectedDiff = Math.abs(homeGoals - awayGoals);
    if (expectedDiff !== goalDiff) {
      setDiffWarning({ expected: expectedDiff });
      return;
    }
    submit.mutate();
  }

  if (matchLoading || !match) {
    return <div className="loading"><div className="spinner" /></div>;
  }

  const deadline = subHours(new Date(match.kickoff_time_utc), 1);
  const isPast = new Date() > deadline || match.status !== 'scheduled';
  const pts = match.round === 'group' ? '2 pts' : '3 pts';
  const homeClr = teamColor(match.home_team);
  const awayClr = teamColor(match.away_team);

  // "Next match" = the very next match by kickoff time after the current one,
  // whose deadline hasn't passed and which has real teams (not TBD bracket placeholders).
  // Pure time-based — no preference for un-predicted, no skipping logic.
  // This means: even if you've already predicted the next match, the button still
  // takes you there. You can use it to walk through matches in order.
  const now = new Date();
  const currentKickoff = new Date(match.kickoff_time_utc).getTime();
  const nextMatch = (allMatches ?? [])
    .filter(m =>
      m.id !== Number(matchId) &&
      m.status === 'scheduled' &&
      !m.home_team.startsWith('TBD') &&
      !m.away_team.startsWith('TBD') &&
      new Date(m.kickoff_time_utc).getTime() > currentKickoff &&
      new Date(m.kickoff_time_utc).getTime() - 60 * 60 * 1000 > now.getTime()
    )
    .sort((a, b) => new Date(a.kickoff_time_utc).getTime() - new Date(b.kickoff_time_utc).getTime())[0] ?? null;
  // Keep the ref synced for the mutation callback (which runs after async settle)
  nextMatchAtSubmit.current = nextMatch?.id ?? null;

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
            <span className="text-muted text-xs">{format(new Date(match.kickoff_time_utc), 'MMM d, HH:mm')} {localTimezoneLabel()}</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: 8, alignItems: 'center' }}>
            <div style={{ textAlign: 'center' }}>
              <div className="flag-wave" style={{ fontSize: 42, lineHeight: 1 }}>{flag(match.home_team)}</div>
              <div style={{ fontWeight: 800, fontSize: 15, marginTop: 6, lineHeight: 1.2 }}>{match.home_team}</div>
            </div>
            <div style={{ textAlign: 'center', padding: '0 8px' }}>
              {(match.status === 'finished' || match.status === 'live') && match.home_score !== null ? (
                <div>
                  <div style={{ fontWeight: 900, fontSize: 24, color: match.status === 'live' ? '#e8a020' : 'var(--primary)' }}>
                    {match.home_score}–{match.away_score}
                  </div>
                  {match.status === 'live' && (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, marginTop: 3 }}>
                      <div style={{ width: 7, height: 7, borderRadius: '50%', background: '#e53e3e', animation: 'pulse 1.5s infinite' }} />
                      <span style={{ fontSize: 10, fontWeight: 700, color: '#e53e3e', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Live</span>
                    </div>
                  )}
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
          {!isPast && (
            <div style={{ textAlign: 'center', marginTop: 10 }}>
              <CalendarReminder
                matchId={match.id}
                homeTeam={match.home_team}
                awayTeam={match.away_team}
                kickoffUtc={match.kickoff_time_utc}
              />
            </div>
          )}
        </div>
      </div>

      {isPast && (
        <div className="alert alert-warning" style={{ marginTop: 0, background: match.status === 'live' ? 'rgba(232,160,32,0.15)' : undefined }}>
          {match.status === 'finished'
            ? `Final score: ${match.home_score} – ${match.away_score}`
            : match.status === 'live'
              ? '🔴 Match in progress — predictions are locked'
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
            onClick={handleSubmitClick}
            disabled={submit.isPending || saved}
          >
            {submit.isPending ? 'Saving...' : saved ? '✓ Saved!' : existing ? 'Update Prediction' : 'Save Prediction'}
          </button>

          {/* Next-match shortcut button — always visible if there's a next match to predict */}
          {nextMatch && (
            <Link
              to={`/predict/${nextMatch.id}`}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 10,
                marginTop: 10,
                padding: '12px 16px',
                background: 'rgba(255,255,255,0.12)',
                border: '1px solid rgba(255,255,255,0.25)',
                borderRadius: 12,
                textDecoration: 'none',
                color: 'white',
              }}
            >
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 10, fontWeight: 700, opacity: 0.7, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                  Next match
                </div>
                <div style={{ fontSize: 14, fontWeight: 800, marginTop: 2, display: 'flex', alignItems: 'center', gap: 6, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  <span>{flag(nextMatch.home_team)}</span>
                  <span>{nextMatch.home_team}</span>
                  <span style={{ opacity: 0.6 }}>vs</span>
                  <span>{nextMatch.away_team}</span>
                  <span>{flag(nextMatch.away_team)}</span>
                </div>
                <div style={{ fontSize: 11, opacity: 0.7, marginTop: 2 }}>
                  {format(new Date(nextMatch.kickoff_time_utc), 'EEE MMM d · HH:mm')} {localTimezoneLabel()}
                </div>
              </div>
              <span style={{ fontSize: 22, fontWeight: 900, flexShrink: 0 }}>→</span>
            </Link>
          )}
        </>
      )}

      {/* ── Everyone's predictions (only visible after deadline) ─────────── */}
      {allPredictions?.deadlinePassed && allPredictions.predictions.length > 0 && (() => {
        // Group players by exact scoreline (e.g. "2-1"). Order: most popular
        // group first; but once the match has finished, the group matching the
        // actual final score sticks to the top with a 🎯 highlight.
        const groups = new Map<string, typeof allPredictions.predictions>();
        for (const p of allPredictions.predictions) {
          const key = `${p.team_a_goals}-${p.team_b_goals}`;
          if (!groups.has(key)) groups.set(key, []);
          groups.get(key)!.push(p);
        }
        const finished = match.status === 'finished';
        const isLive = allPredictions.isLive;
        const actualKey = finished && match.home_score != null && match.away_score != null
          ? `${match.home_score}-${match.away_score}`
          : null;

        const ordered = [...groups.entries()].sort((a, b) => {
          if (actualKey) {
            if (a[0] === actualKey) return -1;
            if (b[0] === actualKey) return 1;
          }
          // During live: sort groups by highest provisional points any member has
          if (isLive) {
            const maxA = Math.max(0, ...a[1].map(p => p.provisional_points ?? 0));
            const maxB = Math.max(0, ...b[1].map(p => p.provisional_points ?? 0));
            if (maxB !== maxA) return maxB - maxA;
          }
          // Larger group first; ties broken numerically (lower scoreline first)
          if (b[1].length !== a[1].length) return b[1].length - a[1].length;
          return a[0].localeCompare(b[0], undefined, { numeric: true });
        });

        return (
        <div style={{ marginTop: 24 }}>
          <p className="section-header" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span>🔓</span>
            <span>Everyone's Predictions ({allPredictions.predictions.length})</span>
          </p>
          {allPredictions.isLive && (
            <p className="text-muted text-xs" style={{ textAlign: 'center', marginBottom: 8 }}>
              Provisional points based on current score — updates every 30 s
            </p>
          )}
          {ordered.map(([scoreKey, members]) => {
            const isWinningGroup = scoreKey === actualKey;
            return (
              <div
                key={scoreKey}
                className="card"
                style={{
                  padding: 0,
                  overflow: 'hidden',
                  marginBottom: 12,
                  border: isWinningGroup ? '2px solid var(--primary)' : undefined,
                  boxShadow: isWinningGroup ? '0 4px 14px rgba(31,106,58,0.25)' : undefined,
                }}
              >
                {/* Group header */}
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '10px 14px',
                  background: isWinningGroup
                    ? 'linear-gradient(90deg, rgba(31,106,58,0.18), rgba(31,106,58,0.05))'
                    : 'var(--green-light, rgba(31,106,58,0.06))',
                  borderBottom: '1px solid var(--border)',
                }}>
                  {isWinningGroup && <span style={{ fontSize: 16 }}>🎯</span>}
                  {isLive && <span style={{ fontSize: 14 }}>🔴</span>}
                  <span style={{ fontSize: 13, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span>{flag(match.home_team)}</span>
                    <b style={{ color: isLive ? '#c07a00' : 'var(--primary)', fontSize: 16 }}>{scoreKey.replace('-', '–')}</b>
                    <span>{flag(match.away_team)}</span>
                  </span>
                  <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text-muted)', fontWeight: 600 }}>
                    {members.length} {members.length === 1 ? 'pick' : 'picks'}
                    {isWinningGroup && <span style={{ color: 'var(--primary)', marginLeft: 6 }}>· FINAL</span>}
                  </span>
                </div>

                {/* Members */}
                {members.map((p, i) => {
                  const resultLabel = p.prediction_result === 'home'
                    ? teamShort(match.home_team)
                    : p.prediction_result === 'away'
                      ? teamShort(match.away_team)
                      : 'Draw';
                  const firstScorerLabel = p.first_scorer === 'home'
                    ? teamShort(match.home_team)
                    : p.first_scorer === 'away'
                      ? teamShort(match.away_team)
                      : 'None';
                  const firstScorerFlag = p.first_scorer === 'home'
                    ? flag(match.home_team)
                    : p.first_scorer === 'away'
                      ? flag(match.away_team)
                      : '🚫';

                  return (
                    <div
                      key={p.id}
                      style={{
                        padding: '12px 14px',
                        borderTop: i > 0 ? '1px solid var(--border)' : 'none',
                        background: p.is_default ? 'rgba(232,160,32,0.08)' : 'white',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                        <div className="avatar" style={{ background: avatarColor(p.name), width: 30, height: 30, fontSize: 11 }}>
                          {initials(p.name)}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 13, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {p.name}
                          </div>
                          {p.is_default && (
                            <div style={{ fontSize: 10, color: 'var(--accent-dark)', fontWeight: 600 }}>
                              ⚠️ Auto-default
                            </div>
                          )}
                        </div>
                        {(() => {
                          const pts = finished ? p.points_earned : isLive ? (p.provisional_points ?? null) : null;
                          if (pts === null || pts === undefined) return null;
                          return (
                            <div style={{
                              fontWeight: 800,
                              fontSize: 14,
                              color: pts > 0 ? (finished ? 'var(--primary)' : '#c07a00') : 'var(--text-muted)',
                              background: pts > 0 ? (finished ? 'rgba(31,106,58,0.12)' : 'rgba(232,160,32,0.15)') : 'transparent',
                              padding: '3px 9px',
                              borderRadius: 999,
                            }}>
                              {isLive ? '~' : '+'}{pts} pts
                            </div>
                          );
                        })()}
                      </div>

                      {/* Result + diff + first-scorer (home/away goals are now in the group header, no need to repeat) */}
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 4 }}>
                        <Field label="Result" value={resultLabel} />
                        <Field label="Diff" value={String(p.goal_difference)} />
                        <Field label="1st" value={firstScorerLabel} flag={firstScorerFlag} />
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })}
          <p className="text-muted text-xs" style={{ textAlign: 'center', marginTop: 8 }}>
            Grouped by exact scoreline. Largest group first; the actual result (when known) pins to the top.
          </p>
        </div>
        );
      })()}

      {/* Goal-diff mismatch confirmation modal — replaces the browser's confirm()
          so the dialog matches the app's look (no "vercel.app says" header). */}
      {diffWarning && (
        <div
          onClick={() => setDiffWarning(null)}
          style={{
            position: 'fixed', inset: 0,
            background: 'rgba(0,0,0,0.6)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: 20, zIndex: 1000,
            backdropFilter: 'blur(2px)',
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: 'white',
              borderRadius: 16,
              maxWidth: 360, width: '100%',
              boxShadow: '0 20px 50px rgba(0,0,0,0.4)',
              overflow: 'hidden',
            }}
          >
            {/* Amber header bar */}
            <div style={{
              background: 'linear-gradient(135deg, #f9ca24 0%, #e8a020 100%)',
              padding: '18px 20px',
              display: 'flex', alignItems: 'center', gap: 10,
            }}>
              <span style={{ fontSize: 28 }}>⚠️</span>
              <div style={{ fontWeight: 800, fontSize: 17, color: 'white' }}>
                Goal difference mismatch
              </div>
            </div>

            <div style={{ padding: 20 }}>
              <p style={{ fontSize: 14, lineHeight: 1.5, marginBottom: 14, color: 'var(--text)' }}>
                You entered <b>{homeGoals}–{awayGoals}</b>, a difference of{' '}
                <b style={{ color: 'var(--primary)' }}>{diffWarning.expected}</b>.
                <br />
                But Goal Difference is set to <b style={{ color: '#e8a020' }}>{goalDiff}</b>.
              </p>
              <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 18, lineHeight: 1.4 }}>
                If you save anyway, you'll lose the goal-difference point if your guess is wrong.
                The diff is a separate prediction — saving on purpose is fine.
              </p>

              <div style={{ display: 'flex', gap: 10 }}>
                <button
                  onClick={() => setDiffWarning(null)}
                  style={{
                    flex: 1, padding: '12px', borderRadius: 10,
                    border: '2px solid var(--border)',
                    background: 'white',
                    color: 'var(--text)',
                    fontWeight: 700, fontSize: 14,
                    cursor: 'pointer',
                  }}
                >
                  ← Fix it
                </button>
                <button
                  onClick={() => { setDiffWarning(null); submit.mutate(); }}
                  style={{
                    flex: 1, padding: '12px', borderRadius: 10,
                    border: 'none',
                    background: '#e8a020',
                    color: 'white',
                    fontWeight: 700, fontSize: 14,
                    cursor: 'pointer',
                  }}
                >
                  Save anyway
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
