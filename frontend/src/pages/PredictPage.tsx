import { useQuery } from '@tanstack/react-query';
import { format, subHours, isToday, isAfter, isBefore } from 'date-fns';
import { Link } from 'react-router-dom';
import { useState, useMemo } from 'react';
import { matchesApi, predictionsApi } from '../api';
import { Countdown } from '../components/Countdown';
import { Match, MatchPrediction } from '../types';
import { flag, teamColor, localTimezoneLabel } from '../utils/flags';

function deadlineFor(kickoff: string) {
  return subHours(new Date(kickoff), 1);
}

function predictionStatus(match: Match, pred?: MatchPrediction) {
  const deadline = deadlineFor(match.kickoff_time_utc);
  const now = new Date();
  const secsToDeadline = (deadline.getTime() - now.getTime()) / 1000;

  if (match.status === 'finished') return 'finished';
  // Order matters: check if user actually submitted BEFORE marking expired,
  // so a deadline-passed match with a real prediction shows 'submitted',
  // not 'expired/Default applied'.
  if (pred && !pred.is_default) return 'submitted';
  if (now > deadline) return 'expired'; // no real pred AND deadline gone → defaulted
  if (!pred) {
    if (secsToDeadline < 3600) return 'urgent';
    if (secsToDeadline < 86400) return 'warning';
    return 'upcoming';
  }
  // pred exists but is_default true and deadline still ahead — still editable
  return 'submitted';
}

function StatusPill({ status, pred }: { status: string; pred?: MatchPrediction }) {
  if (status === 'submitted' && pred)
    return <span className="badge badge-green">✓ {pred.team_a_goals}–{pred.team_b_goals}{pred.is_default ? ' (default)' : ''}</span>;
  if (status === 'finished' && pred?.points_earned != null)
    return <span className="badge badge-blue">+{pred.points_earned} pts</span>;
  if (status === 'expired') return <span className="badge badge-gray">Default applied</span>;
  if (status === 'urgent') return <span className="badge badge-red">⚡ Closes soon</span>;
  if (status === 'warning') return <span className="badge badge-yellow">Predict now</span>;
  return <span className="badge badge-blue">Predict →</span>;
}

function MatchCard({ match, pred }: { match: Match; pred?: MatchPrediction }) {
  const status = predictionStatus(match, pred);
  const deadline = deadlineFor(match.kickoff_time_utc);
  const homeColor = teamColor(match.home_team);
  const awayColor = teamColor(match.away_team);

  const borderClass = {
    submitted: 'pred-submitted',
    warning: 'pred-warning',
    urgent: 'pred-urgent',
    expired: 'pred-expired',
    upcoming: '',
    finished: '',
  }[status] ?? '';

  return (
    <Link to={`/predict/${match.id}`} style={{ textDecoration: 'none', color: 'inherit', display: 'block' }}>
      <div className={`match-card ${borderClass}`}>
        {/* Team color bar */}
        <div className="match-flag-bar">
          <div className="flag-half" style={{ background: homeColor }} />
          <div className="flag-half" style={{ background: awayColor }} />
        </div>

        <div className="match-card-inner">
          <div className="flex-between" style={{ marginBottom: 10 }}>
            <span className="badge badge-gray" style={{ fontSize: 11 }}>
              {match.round === 'group' ? `Group ${match.group_name?.toUpperCase()}` : match.round.toUpperCase()}
            </span>
            <span className="text-muted text-xs">{format(new Date(match.kickoff_time_utc), 'HH:mm')} {localTimezoneLabel()}</span>
          </div>

          {/* Teams with waving flags */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: 8, alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span className="flag-wave" style={{ fontSize: 26 }}>{flag(match.home_team)}</span>
              <span style={{ fontWeight: 700, fontSize: 14, lineHeight: 1.2 }}>{match.home_team}</span>
            </div>

            {match.status === 'finished' ? (
              <div style={{ textAlign: 'center', padding: '0 6px' }}>
                <span style={{ fontWeight: 900, fontSize: 20, color: 'var(--primary)' }}>
                  {match.home_score}–{match.away_score}
                </span>
              </div>
            ) : (
              <div style={{ textAlign: 'center', padding: '0 6px' }}>
                <span style={{ color: 'var(--text-muted)', fontWeight: 700, fontSize: 13 }}>vs</span>
              </div>
            )}

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8 }}>
              <span style={{ fontWeight: 700, fontSize: 14, lineHeight: 1.2, textAlign: 'right' }}>{match.away_team}</span>
              <span className="flag-wave-reverse" style={{ fontSize: 26 }}>{flag(match.away_team)}</span>
            </div>
          </div>

          <div className="flex-between" style={{ marginTop: 10 }}>
            <StatusPill status={status} pred={pred} />
            {status !== 'finished' && status !== 'expired' && <Countdown deadline={deadline} />}
          </div>
        </div>
      </div>
    </Link>
  );
}

type Filter = 'next' | 'today' | 'group' | 'ko' | 'past' | 'all';

const FILTERS: { key: Filter; label: string }[] = [
  { key: 'next',  label: 'Upcoming' },
  { key: 'today', label: 'Today' },
  { key: 'group', label: 'Group' },
  { key: 'ko',    label: 'Knockout' },
  { key: 'past',  label: 'Past' },
  { key: 'all',   label: 'All' },
];

function isKnockout(round: string) {
  return round !== 'group';
}

function applyFilter(matches: Match[], filter: Filter): Match[] {
  const now = new Date();
  switch (filter) {
    case 'next':
      // "Upcoming" = next 10 matches that haven't kicked off yet, regardless of how far out.
      // Sorted by kickoff ascending so the very next match is first.
      return matches
        .filter(m => m.status !== 'finished' && isAfter(new Date(m.kickoff_time_utc), now))
        .sort((a, b) => new Date(a.kickoff_time_utc).getTime() - new Date(b.kickoff_time_utc).getTime())
        .slice(0, 10);
    case 'today':
      return matches.filter(m => isToday(new Date(m.kickoff_time_utc)));
    case 'group':
      return matches.filter(m => m.round === 'group');
    case 'ko':
      return matches.filter(m => isKnockout(m.round));
    case 'past':
      return matches.filter(m => m.status === 'finished' || isBefore(new Date(m.kickoff_time_utc), now));
    case 'all':
    default:
      return matches;
  }
}

export function PredictPage() {
  const { data: matches } = useQuery({ queryKey: ['matches'], queryFn: matchesApi.all });
  const { data: myPredictions } = useQuery({ queryKey: ['my-predictions'], queryFn: predictionsApi.my });

  const [filter, setFilter] = useState<Filter>('next');

  const predMap = new Map(myPredictions?.map(p => [p.match_id, p]));

  const filtered = useMemo(() => applyFilter(matches ?? [], filter), [matches, filter]);

  // Past tab: latest games at the top. Other tabs: chronological (earliest first).
  const orderedFiltered = useMemo(() => {
    if (filter !== 'past') return filtered;
    return [...filtered].sort((a, b) =>
      new Date(b.kickoff_time_utc).getTime() - new Date(a.kickoff_time_utc).getTime()
    );
  }, [filtered, filter]);

  const grouped = new Map<string, Match[]>();
  for (const m of orderedFiltered) {
    const day = format(new Date(m.kickoff_time_utc), 'yyyy-MM-dd');
    if (!grouped.has(day)) grouped.set(day, []);
    grouped.get(day)!.push(m);
  }

  const totalSubmitted = myPredictions?.filter(p => !p.is_default).length ?? 0;
  const totalMatches = matches?.length ?? 0;

  return (
    <div className="page">
      {/* Header */}
      <div style={{ marginBottom: 16 }}>
        <h1 style={{ fontSize: 24, fontWeight: 900, color: 'white', marginBottom: 4 }}>Predictions</h1>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ color: 'rgba(255,255,255,0.65)', fontSize: 13 }}>{totalSubmitted} of {totalMatches} submitted</span>
          <Link to="/pre-tournament" className="badge badge-gold" style={{ textDecoration: 'none', padding: '5px 12px', fontSize: 13 }}>
            🏆 Pre-Tournament
          </Link>
        </div>
        {/* Progress bar */}
        {totalMatches > 0 && (
          <div style={{ height: 4, background: 'rgba(255,255,255,0.15)', borderRadius: 4, marginTop: 10, overflow: 'hidden' }}>
            <div style={{
              height: '100%',
              background: 'linear-gradient(90deg, var(--accent), #f9ca24)',
              borderRadius: 4,
              width: `${(totalSubmitted / totalMatches) * 100}%`,
              transition: 'width 0.5s ease',
              boxShadow: '0 0 8px rgba(232,160,32,0.6)',
            }} />
          </div>
        )}
      </div>

      {/* Filter chips */}
      <div style={{
        display: 'flex',
        gap: 6,
        overflowX: 'auto',
        marginBottom: 14,
        paddingBottom: 4,
        WebkitOverflowScrolling: 'touch',
      }}>
        {FILTERS.map(({ key, label }) => {
          const active = filter === key;
          return (
            <button
              key={key}
              onClick={() => setFilter(key)}
              style={{
                flex: '0 0 auto',
                padding: '6px 14px',
                borderRadius: 999,
                border: 'none',
                background: active ? 'white' : 'rgba(255,255,255,0.15)',
                color: active ? 'var(--primary)' : 'white',
                fontWeight: 700,
                fontSize: 12,
                cursor: 'pointer',
                whiteSpace: 'nowrap',
              }}
            >
              {label}
            </button>
          );
        })}
      </div>

      {filtered.length === 0 && (
        <div className="card" style={{ textAlign: 'center', padding: 24 }}>
          <p className="text-muted">No matches in this filter.</p>
        </div>
      )}

      {Array.from(grouped.entries()).map(([day, dayMatches]) => (
        <div key={day} style={{ marginBottom: 24 }}>
          <p style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.55)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 10 }}>
            {format(new Date(day), 'EEEE, MMMM d')}
          </p>
          {dayMatches.map(match => (
            <MatchCard key={match.id} match={match} pred={predMap.get(match.id)} />
          ))}
        </div>
      ))}
    </div>
  );
}
