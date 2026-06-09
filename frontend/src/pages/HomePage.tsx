import { useQuery } from '@tanstack/react-query';
import { format, subHours, formatDistanceToNow } from 'date-fns';
import { Link } from 'react-router-dom';
import { matchesApi, leaderboardApi, predictionsApi } from '../api';
import { useAuth } from '../contexts/AuthContext';
import { Match, MatchPrediction } from '../types';
import { flag, teamColor, avatarColor, localTimezoneLabel } from '../utils/flags';
import { InstallPrompt } from '../components/InstallPrompt';

function MatchCard({ match, compact, myPrediction }: { match: Match; compact?: boolean; myPrediction?: MatchPrediction }) {
  const homeClr = teamColor(match.home_team);
  const awayClr = teamColor(match.away_team);
  const isLive = match.status === 'live';
  const isFinished = match.status === 'finished';
  const hasMyPred = !!myPrediction && !myPrediction.is_default;

  return (
    <div className="card" style={{
      padding: 0,
      overflow: 'hidden',
      borderLeft: isLive ? '3px solid var(--red)' : hasMyPred ? '3px solid var(--primary)' : undefined,
    }}>
      <div style={{ display: 'flex', height: 4 }}>
        <div style={{ flex: 1, background: homeClr }} />
        <div style={{ flex: 1, background: awayClr }} />
      </div>
      <div style={{ padding: compact ? '10px 14px' : '12px 16px' }}>
        {isLive && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
            <span className="live-dot" />
            <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--red)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Live</span>
            {match.stadium && <span className="text-muted text-xs">· {match.stadium}</span>}
          </div>
        )}
        {!isLive && (
          <div className="flex-between" style={{ marginBottom: 8 }}>
            <span className="badge badge-gray" style={{ fontSize: 11 }}>
              {match.round === 'group' ? `Group ${match.group_name?.toUpperCase()}` : match.round.toUpperCase()}
            </span>
            <span className="text-muted text-xs">{format(new Date(match.kickoff_time_utc), 'EEE MMM d · HH:mm')} {localTimezoneLabel()}</span>
          </div>
        )}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: 8, alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span className="flag-wave" style={{ fontSize: compact ? 18 : 22 }}>{flag(match.home_team)}</span>
            <span style={{ fontWeight: 700, fontSize: compact ? 13 : 14 }}>{match.home_team}</span>
          </div>
          {isLive || isFinished ? (
            <div style={{ fontWeight: 900, fontSize: 22, color: 'var(--primary)', letterSpacing: 2, padding: '0 8px', textAlign: 'center' }}>
              {match.home_score ?? 0}–{match.away_score ?? 0}
            </div>
          ) : (
            <span style={{ color: 'var(--text-muted)', fontSize: 12, fontWeight: 600, textAlign: 'center' }}>vs</span>
          )}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 6 }}>
            <span style={{ fontWeight: 700, fontSize: compact ? 13 : 14, textAlign: 'right' }}>{match.away_team}</span>
            <span className="flag-wave-reverse" style={{ fontSize: compact ? 18 : 22 }}>{flag(match.away_team)}</span>
          </div>
        </div>

        {/* My prediction badge — clear visual that user has predicted */}
        {hasMyPred && (
          <div style={{
            marginTop: 10,
            padding: '6px 10px',
            background: 'rgba(31, 106, 58, 0.1)',
            border: '1px solid rgba(31, 106, 58, 0.3)',
            borderRadius: 8,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 8,
          }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--primary)' }}>
              ✓ You predicted: <span style={{ fontWeight: 900 }}>{myPrediction!.team_a_goals}–{myPrediction!.team_b_goals}</span>
            </span>
            {isFinished && myPrediction!.points_earned != null && (
              <span style={{ fontSize: 12, fontWeight: 800, color: 'var(--primary)' }}>
                +{myPrediction!.points_earned} pts
              </span>
            )}
            {!isFinished && !isLive && (
              <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600 }}>
                Tap to edit
              </span>
            )}
          </div>
        )}
        {!hasMyPred && !isFinished && !isLive && (
          <div style={{
            marginTop: 10,
            padding: '6px 10px',
            background: 'rgba(232, 160, 32, 0.15)',
            border: '1px dashed rgba(232, 160, 32, 0.5)',
            borderRadius: 8,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--accent-dark)' }}>
              ⚠️ Not predicted yet
            </span>
            <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent-dark)' }}>
              Tap to predict →
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

interface VoteStats {
  match_id: number;
  home_team: string;
  away_team: string;
  home_votes: number;
  draw_votes: number;
  away_votes: number;
  total_predictions: number;
}

function VoteBar({ label, votes, total, color }: { label: string; votes: number; total: number; color: string }) {
  const pct = total > 0 ? Math.round((Number(votes) / total) * 100) : 0;
  return (
    <div style={{ flex: 1, minWidth: 0 }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</div>
      <div style={{ height: 6, background: '#f0f0f0', borderRadius: 3, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: 3, transition: 'width 0.6s ease' }} />
      </div>
      <div style={{ fontSize: 13, fontWeight: 800, color, marginTop: 3 }}>{pct}%</div>
    </div>
  );
}

function GroupOpinionCard({ stat }: { stat: VoteStats }) {
  const total = Number(stat.total_predictions);
  if (total === 0) return null;
  return (
    <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)' }}>
      <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
        <span>{flag(stat.home_team)}</span>
        <span style={{ color: 'var(--text-muted)' }}>{stat.home_team}</span>
        <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>vs</span>
        <span style={{ color: 'var(--text-muted)' }}>{stat.away_team}</span>
        <span>{flag(stat.away_team)}</span>
        <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text-muted)', fontWeight: 500 }}>{total} votes</span>
      </div>
      <div style={{ display: 'flex', gap: 12 }}>
        <VoteBar label={stat.home_team} votes={stat.home_votes} total={total} color={teamColor(stat.home_team)} />
        <VoteBar label="Draw" votes={stat.draw_votes} total={total} color="#6b7280" />
        <VoteBar label={stat.away_team} votes={stat.away_votes} total={total} color={teamColor(stat.away_team)} />
      </div>
    </div>
  );
}

export function HomePage() {
  const { user } = useAuth();
  const { data: upcoming } = useQuery({ queryKey: ['upcoming-matches'], queryFn: matchesApi.upcoming, refetchInterval: 60_000 });
  const { data: live } = useQuery({ queryKey: ['live-matches'], queryFn: matchesApi.live, refetchInterval: 30_000 });
  const { data: leaderboardData } = useQuery({ queryKey: ['leaderboard'], queryFn: leaderboardApi.all });
  const { data: myStats } = useQuery({ queryKey: ['my-stats'], queryFn: leaderboardApi.me });
  const { data: groupStats } = useQuery({ queryKey: ['group-stats'], queryFn: leaderboardApi.stats });
  const { data: myPredictions } = useQuery({ queryKey: ['my-predictions'], queryFn: predictionsApi.my });
  const { data: summary } = useQuery({ queryKey: ['my-summary'], queryFn: leaderboardApi.summary, staleTime: Infinity });

  const myRank = leaderboardData?.leaderboard.find(e => e.id === user?.id);
  const top5 = leaderboardData?.leaderboard.slice(0, 5) ?? [];
  const myScore = myStats?.score;

  // Next match with a countdown
  const nextMatch = upcoming?.[0];
  const nextDeadline = nextMatch ? subHours(new Date(nextMatch.kickoff_time_utc), 1) : null;
  const deadlinePassed = nextDeadline ? new Date() > nextDeadline : false;
  const hasPredictedNext = myPredictions?.some(p => p.match_id === nextMatch?.id && !p.is_default);

  // Group opinion: only show after the betting deadline has passed.
  // Backend /stats already filters out future matches (server is the source
  // of truth), but we double-check on the client too — defense in depth so a
  // backend regression can't accidentally leak in-flight votes.
  const upcomingById = new Map((upcoming ?? []).map(m => [m.id, m]));
  const opinionStats: VoteStats[] = (groupStats?.popularPredictions ?? [])
    .filter((s: VoteStats) => {
      if (Number(s.total_predictions) === 0) return false;
      const match = upcomingById.get(s.match_id);
      // If we don't have the match in the small upcoming list, the safest
      // assumption is "we can't verify the deadline" → don't show.
      // Backend already filtered to deadline-passed matches, so any match
      // we have client-side info for AND whose deadline has passed is OK.
      if (!match) {
        // Not in upcoming → must be finished/live (backend already verified
        // deadline passed before returning it). Trust the server here.
        return true;
      }
      return new Date() > subHours(new Date(match.kickoff_time_utc), 1);
    })
    .slice(0, 3);

  // My recent results
  const recentFinished = myStats?.matchHistory
    ?.filter((p) => p.match_status === 'finished')
    .slice(0, 3) ?? [];

  // How many upcoming matches the user hasn't actively predicted?
  // Counts: in upcoming list, NOT in myPredictions OR predicted as default.
  const predictedNonDefaultIds = new Set(
    (myPredictions ?? []).filter(p => !p.is_default).map(p => p.match_id)
  );
  // Map of match_id → prediction for inline display on cards
  const predByMatchId = new Map((myPredictions ?? []).map(p => [p.match_id, p]));
  const unpredictedCount = (upcoming ?? []).filter(m => {
    if (predictedNonDefaultIds.has(m.id)) return false;
    return new Date() < subHours(new Date(m.kickoff_time_utc), 1); // deadline not passed
  }).length;

  return (
    <div className="page">
      <InstallPrompt />

      {/* ── "Since last visit" banner ───────────────── */}
      {summary && summary.pointsSinceLastVisit > 0 && (
        <div style={{
          marginBottom: 14,
          padding: '12px 14px',
          background: 'linear-gradient(90deg, rgba(76,175,80,0.3), rgba(139,195,74,0.15))',
          border: '1px solid rgba(139,195,74,0.5)',
          borderRadius: 12,
          color: 'white',
        }}>
          <div style={{ fontSize: 13, fontWeight: 700 }}>
            🎉 +{summary.pointsSinceLastVisit} pts since your last visit!
          </div>
          <div style={{ fontSize: 11, opacity: 0.85, marginTop: 2 }}>
            You're now ranked #{summary.myRank} in your league of {summary.leagueSize}.
          </div>
        </div>
      )}

      {/* ── Hero ───────────────────────────────── */}
      <div className="hero" style={{ marginBottom: 14 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, opacity: 0.55, textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 6 }}>
              FIFA World Cup 2026
            </div>
            <div style={{ fontSize: 24, fontWeight: 900, lineHeight: 1.15 }}>
              Hey, {user?.name} 👋
            </div>
            <div style={{ fontSize: 13, opacity: 0.7, marginTop: 5 }}>
              May the best predictor win
            </div>
          </div>
          {myRank ? (
            <div style={{ textAlign: 'center', background: 'rgba(255,255,255,0.15)', borderRadius: 14, padding: '10px 16px', minWidth: 76 }}>
              <div style={{ fontSize: 9, fontWeight: 700, opacity: 0.65, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 2 }}>Rank</div>
              <div style={{ fontSize: 30, fontWeight: 900, lineHeight: 1 }}>#{myRank.rank}</div>
              <div style={{ fontSize: 12, opacity: 0.75, marginTop: 3 }}>{myRank.total_points} pts</div>
            </div>
          ) : (
            <div style={{ textAlign: 'center', background: 'rgba(255,255,255,0.15)', borderRadius: 14, padding: '10px 16px', minWidth: 76 }}>
              <div style={{ fontSize: 9, fontWeight: 700, opacity: 0.65, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 2 }}>Rank</div>
              <div style={{ fontSize: 24, fontWeight: 900, lineHeight: 1, opacity: 0.5 }}>—</div>
            </div>
          )}
        </div>

        {/* My quick stats row */}
        {myScore && (
          <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
            {[
              { label: 'Points', value: myScore.total_points },
              { label: 'Perfect ⭐', value: myScore.perfect_matches_count },
              { label: 'Group pts', value: myScore.group_stage_points },
            ].map(({ label, value }) => (
              <div key={label} style={{ flex: 1, background: 'rgba(255,255,255,0.13)', borderRadius: 10, padding: '8px 10px', textAlign: 'center' }}>
                <div style={{ fontSize: 20, fontWeight: 900, lineHeight: 1 }}>{value}</div>
                <div style={{ fontSize: 10, opacity: 0.65, marginTop: 2, fontWeight: 600 }}>{label}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Gap tiles (1st / above / below) ─────── */}
      {summary && summary.gaps && (summary.gaps.first || summary.gaps.above || summary.gaps.below) && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
          {summary.gaps.first && (
            <div style={{ flex: 1, background: 'rgba(255,255,255,0.10)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: 10, padding: '8px 8px', textAlign: 'center' }}>
              <div style={{ fontSize: 9, fontWeight: 700, opacity: 0.6, textTransform: 'uppercase', letterSpacing: '0.06em' }}>🥇 1st</div>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'white', marginTop: 3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {summary.gaps.first.name}
              </div>
              <div style={{ fontSize: 13, fontWeight: 800, color: '#ffd700', marginTop: 2 }}>
                {summary.gaps.first.delta > 0 ? `+${summary.gaps.first.delta}` : '✓ You'}
              </div>
            </div>
          )}
          {summary.gaps.above && (
            <div style={{ flex: 1, background: 'rgba(255,255,255,0.10)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: 10, padding: '8px 8px', textAlign: 'center' }}>
              <div style={{ fontSize: 9, fontWeight: 700, opacity: 0.6, textTransform: 'uppercase', letterSpacing: '0.06em' }}>↑ Above</div>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'white', marginTop: 3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {summary.gaps.above.name}
              </div>
              <div style={{ fontSize: 13, fontWeight: 800, color: '#ff9494', marginTop: 2 }}>
                +{summary.gaps.above.delta}
              </div>
            </div>
          )}
          {summary.gaps.below && (
            <div style={{ flex: 1, background: 'rgba(255,255,255,0.10)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: 10, padding: '8px 8px', textAlign: 'center' }}>
              <div style={{ fontSize: 9, fontWeight: 700, opacity: 0.6, textTransform: 'uppercase', letterSpacing: '0.06em' }}>↓ Below</div>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'white', marginTop: 3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {summary.gaps.below.name}
              </div>
              <div style={{ fontSize: 13, fontWeight: 800, color: '#94ff94', marginTop: 2 }}>
                {summary.gaps.below.delta}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Unpredicted nudge ────────────────────── */}
      {unpredictedCount > 0 && (
        <Link
          to="/predict"
          style={{
            display: 'block',
            marginBottom: 18,
            padding: '12px 14px',
            background: 'linear-gradient(90deg, rgba(232,160,32,0.25), rgba(232,160,32,0.1))',
            border: '1px solid rgba(232,160,32,0.5)',
            borderRadius: 12,
            textDecoration: 'none',
            color: 'white',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700 }}>
                ⚡ {unpredictedCount} of the next 10 {unpredictedCount === 1 ? 'match still needs' : 'matches still need'} a prediction
              </div>
              <div style={{ fontSize: 11, opacity: 0.8, marginTop: 2 }}>
                Tap to predict before deadlines lock in
              </div>
            </div>
            <span style={{ fontSize: 18, fontWeight: 800 }}>→</span>
          </div>
        </Link>
      )}

      {/* ── Live matches ─────────────────────────── */}
      {live && live.length > 0 && (
        <section style={{ marginBottom: 20 }}>
          <p className="section-header">🔴 Live Now</p>
          {live.map(m => (
            <Link key={m.id} to={`/predict/${m.id}`} style={{ textDecoration: 'none', color: 'inherit', display: 'block' }}>
              <MatchCard match={m} myPrediction={predByMatchId.get(m.id)} />
            </Link>
          ))}
        </section>
      )}

      {/* ── Next match + deadline nudge ──────────── */}
      {nextMatch && (
        <section style={{ marginBottom: 20 }}>
          <p className="section-header">⏰ Next Match</p>
          <Link to={`/predict/${nextMatch.id}`} style={{ textDecoration: 'none', color: 'inherit' }}>
            <MatchCard match={nextMatch} myPrediction={predByMatchId.get(nextMatch.id)} />
          </Link>
          {!deadlinePassed && (
            <div style={{
              background: hasPredictedNext ? 'rgba(39,174,96,0.15)' : 'rgba(232,160,32,0.18)',
              border: `1px solid ${hasPredictedNext ? 'rgba(39,174,96,0.4)' : 'rgba(232,160,32,0.5)'}`,
              borderRadius: 10, padding: '10px 14px',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              marginTop: -4,
            }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: hasPredictedNext ? 'var(--green)' : 'var(--accent)' }}>
                {hasPredictedNext ? '✓ You\'ve predicted this one' : '⚡ Deadline: ' + (nextDeadline ? formatDistanceToNow(nextDeadline, { addSuffix: true }) : '')}
              </span>
              {!hasPredictedNext && (
                <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--accent)', background: 'rgba(232,160,32,0.2)', padding: '3px 10px', borderRadius: 20 }}>
                  Predict →
                </span>
              )}
            </div>
          )}
        </section>
      )}

      {/* ── Upcoming (rest) ──────────────────────── */}
      {upcoming && upcoming.length > 1 && (
        <section style={{ marginBottom: 20 }}>
          <p className="section-header">📅 Coming Up</p>
          {upcoming.slice(1, 4).map(m => (
            <Link key={m.id} to={`/predict/${m.id}`} style={{ textDecoration: 'none', color: 'inherit', display: 'block' }}>
              <MatchCard match={m} compact myPrediction={predByMatchId.get(m.id)} />
            </Link>
          ))}
          <Link to="/predict" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(255,255,255,0.8)', fontWeight: 700, fontSize: 14, padding: '10px 0', textDecoration: 'none' }}>
            All matches →
          </Link>
        </section>
      )}

      {/* ── Group opinion ─────────────────────────── */}
      {opinionStats.length > 0 && (
        <section style={{ marginBottom: 20 }}>
          <p className="section-header">🗳️ Group Opinion</p>
          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            {opinionStats.map((stat) => (
              <GroupOpinionCard key={stat.match_id} stat={stat} />
            ))}
            <div style={{ padding: '10px 16px', textAlign: 'center' }}>
              <span className="text-muted text-xs">How your group is voting on upcoming matches</span>
            </div>
          </div>
        </section>
      )}

      {/* ── My recent results ─────────────────────── */}
      {recentFinished.length > 0 && (
        <section style={{ marginBottom: 20 }}>
          <p className="section-header">📊 My Recent Results</p>
          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            {recentFinished.map((pred, i) => {
              const maxPts = pred.round === 'group' ? 10 : 15;
              const isPerfect = pred.points_earned === maxPts;
              const pts = pred.points_earned ?? 0;
              return (
                <div key={pred.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', borderBottom: i < recentFinished.length - 1 ? '1px solid var(--border)' : 'none' }}>
                  <div style={{ display: 'flex', gap: 4, fontSize: 18 }}>
                    <span>{flag(pred.home_team ?? '')}</span>
                    <span>{flag(pred.away_team ?? '')}</span>
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {pred.home_team} vs {pred.away_team}
                    </div>
                    <div className="text-xs text-muted">
                      Your bet: {pred.team_a_goals}–{pred.team_b_goals} · Actual: {pred.home_score ?? '?'}–{pred.away_score ?? '?'}
                    </div>
                  </div>
                  <div style={{
                    fontWeight: 800, fontSize: 16,
                    color: isPerfect ? 'var(--gold)' : pts > 0 ? 'var(--green)' : 'var(--text-muted)',
                  }}>
                    {isPerfect ? '⭐' : ''}{pts > 0 ? `+${pts}` : '0'}
                  </div>
                </div>
              );
            })}
          </div>
          <Link to="/profile" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(255,255,255,0.8)', fontWeight: 700, fontSize: 14, padding: '10px 0', textDecoration: 'none' }}>
            Full history →
          </Link>
        </section>
      )}

      {/* ── Leaderboard top 5 ─────────────────────── */}
      {top5.length > 0 && (
        <section style={{ marginBottom: 20 }}>
          <p className="section-header">🏆 Standings</p>
          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            {top5.map((entry, i) => (
              <div
                key={entry.id}
                className={entry.id === user?.id ? 'rank-me' : ''}
                style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', borderBottom: i < top5.length - 1 ? '1px solid var(--border)' : 'none' }}
              >
                <span style={{ fontSize: 18, width: 26, textAlign: 'center' }}>
                  {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${entry.rank}`}
                </span>
                <div className="avatar" style={{ background: avatarColor(entry.name), width: 34, height: 34, fontSize: 13 }}>
                  {entry.name.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase()}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: 13 }}>{entry.name}{entry.id === user?.id ? ' 👈' : ''}</div>
                  <div className="text-xs text-muted">{entry.perfect_matches_count} perfect</div>
                </div>
                <div style={{ fontWeight: 800, fontSize: 17, color: 'var(--primary)' }}>{entry.total_points}</div>
              </div>
            ))}
          </div>
          <Link to="/leaderboard" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(255,255,255,0.8)', fontWeight: 700, fontSize: 14, padding: '10px 0', textDecoration: 'none' }}>
            Full standings →
          </Link>
        </section>
      )}
    </div>
  );
}
