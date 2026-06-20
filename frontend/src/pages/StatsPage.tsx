import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { leaderboardApi } from '../api';
import { avatarColor, initials } from '../utils/flags';

type RawStat = {
  id: number; name: string;
  total_points: number; perfect_matches_count: number;
  group_stage_points: number; knockout_points: number;
  total_finished: number; real_predictions: number; defaults_count: number;
  correct_results: number; exact_scores: number;
  correct_first_scorers: number; total_with_first_scorer: number;
  correct_goal_diffs: number;
};

type EnrichedStat = RawStat & {
  resultPct: number | null;
  exactPct: number | null;
  firstScorerPct: number | null;
  goalDiffPct: number | null;
  ppm: number | null;
};

type SortKey = 'ppm' | 'results' | 'exact' | 'first_scorer' | 'goal_diff' | 'perfects' | 'defaults';

function pct(n: number, d: number): number | null {
  return d > 0 ? Math.round(n / d * 100) : null;
}

function enrich(s: RawStat): EnrichedStat {
  return {
    ...s,
    resultPct: pct(Number(s.correct_results), Number(s.total_finished)),
    exactPct: pct(Number(s.exact_scores), Number(s.total_finished)),
    firstScorerPct: pct(Number(s.correct_first_scorers), Number(s.total_with_first_scorer)),
    goalDiffPct: pct(Number(s.correct_goal_diffs), Number(s.total_finished)),
    ppm: Number(s.total_finished) > 0
      ? Math.round(Number(s.total_points) / Number(s.total_finished) * 10) / 10
      : null,
  };
}

const SORT_LABELS: Record<SortKey, string> = {
  ppm: 'Pts/Match',
  results: 'Result %',
  exact: 'Exact %',
  first_scorer: '1st Scorer %',
  goal_diff: 'Goal Diff %',
  perfects: '⭐ Perfects',
  defaults: 'Missed',
};

function HorizontalBar({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = max > 0 ? (value / max) * 100 : 0;
  return (
    <div style={{ flex: 1, height: 8, background: 'rgba(0,0,0,0.07)', borderRadius: 4, overflow: 'hidden' }}>
      <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 4, transition: 'width 0.6s ease' }} />
    </div>
  );
}

function PointsChart({ stats }: { stats: EnrichedStat[] }) {
  const sorted = [...stats].sort((a, b) => Number(b.total_points) - Number(a.total_points)).slice(0, 3);
  const max = Math.max(...sorted.map(p => Number(p.total_points)), 1);
  const colors = ['#f6c90e', '#b0b0b0', '#cd7f32'];

  return (
    <div className="card" style={{ marginBottom: 20 }}>
      <div style={{ fontWeight: 800, fontSize: 14, marginBottom: 14 }}>🏆 Total Points</div>
      {sorted.map((p, i) => (
        <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
          <div style={{
            width: 22, height: 22, borderRadius: '50%', flexShrink: 0,
            background: i < 3 ? colors[i] : 'var(--surface-2, rgba(0,0,0,0.08))',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 10, fontWeight: 800, color: i < 3 ? '#222' : 'var(--text-muted)',
          }}>
            {i + 1}
          </div>
          <Link to={`/player/${p.id}`} style={{ textDecoration: 'none', color: 'inherit' }}>
            <div className="avatar" style={{ background: avatarColor(p.name), width: 28, height: 28, fontSize: 10, flexShrink: 0 }}>
              {initials(p.name)}
            </div>
          </Link>
          <span style={{ fontSize: 13, fontWeight: 600, width: 90, flexShrink: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {p.name}
          </span>
          <HorizontalBar value={Number(p.total_points)} max={max} color={i < 3 ? colors[i] : 'var(--primary)'} />
          <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--primary)', width: 36, textAlign: 'right', flexShrink: 0 }}>
            {p.total_points}
          </span>
        </div>
      ))}
    </div>
  );
}

const ACCURACY_CATEGORIES = [
  { key: 'resultPct' as keyof EnrichedStat, label: '🎯 Correct Result', color: '#4caf50' },
  { key: 'exactPct' as keyof EnrichedStat, label: '⚽ Exact Score', color: '#2196f3' },
  { key: 'firstScorerPct' as keyof EnrichedStat, label: '🥅 First Scorer', color: '#ff9800' },
  { key: 'goalDiffPct' as keyof EnrichedStat, label: '📐 Goal Difference', color: '#9c27b0' },
];

function AccuracyChart({ stats }: { stats: EnrichedStat[] }) {
  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ fontWeight: 800, fontSize: 14, color: 'white', marginBottom: 10 }}>📊 Accuracy by Category</div>
      {ACCURACY_CATEGORIES.map(cat => {
        const sorted = [...stats]
          .filter(p => p[cat.key] !== null)
          .sort((a, b) => Number(b[cat.key]) - Number(a[cat.key]))
          .slice(0, 3);
        if (sorted.length === 0) return null;
        const max = 100;
        return (
          <div key={cat.key} className="card" style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>{cat.label}</div>
            {sorted.map(p => (
              <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 7 }}>
                <Link to={`/player/${p.id}`} style={{ textDecoration: 'none', color: 'inherit' }}>
                  <div className="avatar" style={{ background: avatarColor(p.name), width: 24, height: 24, fontSize: 9, flexShrink: 0 }}>
                    {initials(p.name)}
                  </div>
                </Link>
                <span style={{ fontSize: 12, fontWeight: 600, width: 80, flexShrink: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {p.name}
                </span>
                <HorizontalBar value={Number(p[cat.key])} max={max} color={cat.color} />
                <span style={{ fontSize: 12, fontWeight: 700, color: cat.color, width: 34, textAlign: 'right', flexShrink: 0 }}>
                  {p[cat.key]}%
                </span>
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}

function PerfectsChart({ stats }: { stats: EnrichedStat[] }) {
  const sorted = [...stats].sort((a, b) => Number(b.perfect_matches_count) - Number(a.perfect_matches_count)).slice(0, 3);
  const max = Math.max(...sorted.map(p => Number(p.perfect_matches_count)), 1);
  if (max === 0) return null;
  return (
    <div className="card" style={{ marginBottom: 20 }}>
      <div style={{ fontWeight: 800, fontSize: 14, marginBottom: 14 }}>⭐ Perfect Matches</div>
      {sorted.map(p => (
        <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 9 }}>
          <Link to={`/player/${p.id}`} style={{ textDecoration: 'none', color: 'inherit' }}>
            <div className="avatar" style={{ background: avatarColor(p.name), width: 26, height: 26, fontSize: 10, flexShrink: 0 }}>
              {initials(p.name)}
            </div>
          </Link>
          <span style={{ fontSize: 13, fontWeight: 600, width: 90, flexShrink: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {p.name}
          </span>
          <HorizontalBar value={Number(p.perfect_matches_count)} max={max} color='#f6c90e' />
          <span style={{ fontSize: 13, fontWeight: 800, color: '#e8a020', width: 20, textAlign: 'right', flexShrink: 0 }}>
            {Number(p.perfect_matches_count) > 0 ? `${p.perfect_matches_count}⭐` : '—'}
          </span>
        </div>
      ))}
    </div>
  );
}

export function StatsPage() {
  const [sortKey, setSortKey] = useState<SortKey>('ppm');

  const { data, isLoading } = useQuery({
    queryKey: ['player-stats'],
    queryFn: () => leaderboardApi.playerStats(),
  });

  if (isLoading) return <div className="loading"><div className="spinner" /></div>;

  const raw = data?.stats ?? [];
  const stats = raw.map(enrich);
  const anyFinished = stats.some(p => Number(p.total_finished) > 0);

  const sorted = [...stats].sort((a, b) => {
    const valA = sortKey === 'ppm' ? a.ppm
      : sortKey === 'results' ? a.resultPct
      : sortKey === 'exact' ? a.exactPct
      : sortKey === 'first_scorer' ? a.firstScorerPct
      : sortKey === 'goal_diff' ? a.goalDiffPct
      : sortKey === 'perfects' ? Number(a.perfect_matches_count)
      : Number(a.defaults_count);
    const valB = sortKey === 'ppm' ? b.ppm
      : sortKey === 'results' ? b.resultPct
      : sortKey === 'exact' ? b.exactPct
      : sortKey === 'first_scorer' ? b.firstScorerPct
      : sortKey === 'goal_diff' ? b.goalDiffPct
      : sortKey === 'perfects' ? Number(b.perfect_matches_count)
      : Number(b.defaults_count);
    if (valA === null && valB === null) return 0;
    if (valA === null) return 1;
    if (valB === null) return -1;
    return sortKey === 'defaults' ? valA - valB : valB - valA;
  });

  return (
    <div className="page">
      <h2 style={{ color: 'white', marginBottom: 4, fontSize: 22 }}>League Stats</h2>
      <p className="text-muted text-xs" style={{ marginBottom: 20 }}>Based on finished matches only</p>

      {!anyFinished ? (
        <div className="card" style={{ textAlign: 'center', padding: 32 }}>
          <div style={{ fontSize: 36, marginBottom: 12 }}>📊</div>
          <p style={{ fontWeight: 700, marginBottom: 6 }}>No stats yet</p>
          <p className="text-muted text-sm">Stats will appear once the first matches finish.</p>
        </div>
      ) : (
        <>
          <PointsChart stats={stats} />
          <AccuracyChart stats={stats} />
          <PerfectsChart stats={stats} />

          {/* Comparison Table */}
          <div style={{ fontWeight: 800, fontSize: 14, color: 'white', marginBottom: 10 }}>📋 Full Comparison</div>
          <div style={{ marginBottom: 10, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {(Object.keys(SORT_LABELS) as SortKey[]).map(k => (
              <button
                key={k}
                onClick={() => setSortKey(k)}
                style={{
                  fontSize: 11, fontWeight: 700, padding: '4px 10px', borderRadius: 999,
                  border: 'none', cursor: 'pointer',
                  background: sortKey === k ? 'var(--primary)' : 'rgba(255,255,255,0.15)',
                  color: sortKey === k ? 'white' : 'rgba(255,255,255,0.8)',
                }}
              >
                {SORT_LABELS[k]}
              </button>
            ))}
          </div>

          <div style={{ overflowX: 'auto', borderRadius: 12, marginBottom: 24 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', background: 'white', borderRadius: 12, overflow: 'hidden' }}>
              <thead>
                <tr style={{ background: 'var(--surface-2, rgba(0,0,0,0.05))' }}>
                  <th style={{ textAlign: 'left', padding: '10px 12px', fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap' }}>Player</th>
                  {(Object.keys(SORT_LABELS) as SortKey[]).map(k => (
                    <th key={k} onClick={() => setSortKey(k)} style={{
                      padding: '10px 8px', fontSize: 11, fontWeight: 700,
                      color: sortKey === k ? 'var(--primary)' : 'var(--text-muted)',
                      textTransform: 'uppercase', letterSpacing: '0.05em',
                      whiteSpace: 'nowrap', cursor: 'pointer', textAlign: 'center',
                      background: sortKey === k ? 'rgba(31,106,58,0.06)' : undefined,
                    }}>
                      {SORT_LABELS[k]} {sortKey === k ? (k === 'defaults' ? '▲' : '▼') : ''}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sorted.map((p, i) => (
                  <tr key={p.id} style={{ borderTop: i > 0 ? '1px solid var(--border)' : 'none' }}>
                    <td style={{ padding: '10px 12px', whiteSpace: 'nowrap' }}>
                      <Link to={`/player/${p.id}`} style={{ textDecoration: 'none', color: 'inherit', display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div className="avatar" style={{ background: avatarColor(p.name), width: 28, height: 28, fontSize: 10, flexShrink: 0 }}>
                          {initials(p.name)}
                        </div>
                        <span style={{ fontWeight: 700, fontSize: 13 }}>{p.name}</span>
                      </Link>
                    </td>
                    <td style={{ padding: '10px 8px', textAlign: 'center', fontWeight: 700, fontSize: 13, color: sortKey === 'ppm' ? 'var(--primary)' : 'var(--text)' }}>
                      {p.ppm !== null ? p.ppm : '—'}
                    </td>
                    <td style={{ padding: '10px 8px', textAlign: 'center', fontSize: 13, color: sortKey === 'results' ? 'var(--primary)' : 'var(--text)' }}>
                      {p.resultPct !== null ? `${p.resultPct}%` : '—'}
                    </td>
                    <td style={{ padding: '10px 8px', textAlign: 'center', fontSize: 13, color: sortKey === 'exact' ? 'var(--primary)' : 'var(--text)' }}>
                      {p.exactPct !== null ? `${p.exactPct}%` : '—'}
                    </td>
                    <td style={{ padding: '10px 8px', textAlign: 'center', fontSize: 13, color: sortKey === 'first_scorer' ? 'var(--primary)' : 'var(--text)' }}>
                      {p.firstScorerPct !== null ? `${p.firstScorerPct}%` : '—'}
                    </td>
                    <td style={{ padding: '10px 8px', textAlign: 'center', fontSize: 13, color: sortKey === 'goal_diff' ? 'var(--primary)' : 'var(--text)' }}>
                      {p.goalDiffPct !== null ? `${p.goalDiffPct}%` : '—'}
                    </td>
                    <td style={{ padding: '10px 8px', textAlign: 'center', fontWeight: 700, fontSize: 13, color: sortKey === 'perfects' ? 'var(--primary)' : 'var(--text)' }}>
                      {Number(p.perfect_matches_count) > 0 ? `${p.perfect_matches_count} ⭐` : '0'}
                    </td>
                    <td style={{ padding: '10px 8px', textAlign: 'center', fontSize: 13, color: sortKey === 'defaults' ? '#e53e3e' : Number(p.defaults_count) > 0 ? '#e53e3e' : 'var(--text-muted)' }}>
                      {Number(p.defaults_count) === 0 ? '✓' : p.defaults_count}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
