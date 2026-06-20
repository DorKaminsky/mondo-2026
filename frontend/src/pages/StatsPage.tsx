import React, { useState } from 'react';
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

interface ColDef {
  key: SortKey;
  label: string;
  short: string;
  getValue: (p: EnrichedStat) => number | null;
  render: (p: EnrichedStat, active: boolean) => React.ReactNode;
}

const COLUMNS: ColDef[] = [
  {
    key: 'ppm', label: 'Pts/Match', short: 'Pts/M',
    getValue: p => p.ppm,
    render: (p, a) => <td style={{ padding: '10px 8px', textAlign: 'center', fontWeight: 700, fontSize: 13, color: a ? 'var(--primary)' : 'var(--text)' }}>{p.ppm !== null ? p.ppm : '—'}</td>,
  },
  {
    key: 'results', label: 'Outcome %', short: 'Outcome',
    getValue: p => p.resultPct,
    render: (p, a) => <td style={{ padding: '10px 8px', textAlign: 'center', fontSize: 13, color: a ? 'var(--primary)' : 'var(--text)' }}>{p.resultPct !== null ? `${p.resultPct}%` : '—'}</td>,
  },
  {
    key: 'exact', label: 'Scoreline %', short: 'Score',
    getValue: p => p.exactPct,
    render: (p, a) => <td style={{ padding: '10px 8px', textAlign: 'center', fontSize: 13, color: a ? 'var(--primary)' : 'var(--text)' }}>{p.exactPct !== null ? `${p.exactPct}%` : '—'}</td>,
  },
  {
    key: 'first_scorer', label: '1st Goal %', short: '1st Goal',
    getValue: p => p.firstScorerPct,
    render: (p, a) => <td style={{ padding: '10px 8px', textAlign: 'center', fontSize: 13, color: a ? 'var(--primary)' : 'var(--text)' }}>{p.firstScorerPct !== null ? `${p.firstScorerPct}%` : '—'}</td>,
  },
  {
    key: 'goal_diff', label: 'Goal Diff %', short: 'Diff',
    getValue: p => p.goalDiffPct,
    render: (p, a) => <td style={{ padding: '10px 8px', textAlign: 'center', fontSize: 13, color: a ? 'var(--primary)' : 'var(--text)' }}>{p.goalDiffPct !== null ? `${p.goalDiffPct}%` : '—'}</td>,
  },
  {
    key: 'perfects', label: '⭐ Perfects', short: 'Perfect',
    getValue: p => Number(p.perfect_matches_count),
    render: (p, a) => <td style={{ padding: '10px 8px', textAlign: 'center', fontWeight: 700, fontSize: 13, color: a ? 'var(--primary)' : 'var(--text)' }}>{Number(p.perfect_matches_count) > 0 ? `${p.perfect_matches_count} ⭐` : '0'}</td>,
  },
  {
    key: 'defaults', label: 'Missed', short: 'Missed',
    getValue: p => Number(p.defaults_count),
    render: (p, a) => <td style={{ padding: '10px 8px', textAlign: 'center', fontSize: 13, color: a || Number(p.defaults_count) > 0 ? '#e53e3e' : 'var(--text-muted)' }}>{Number(p.defaults_count) === 0 ? '✓' : p.defaults_count}</td>,
  },
];

function HorizontalBar({ value, max, color }: { value: number; max: number; color: string }) {
  const width = max > 0 ? (value / max) * 100 : 0;
  return (
    <div style={{ flex: 1, height: 8, background: 'rgba(0,0,0,0.07)', borderRadius: 4, overflow: 'hidden' }}>
      <div style={{ width: `${width}%`, height: '100%', background: color, borderRadius: 4, transition: 'width 0.6s ease' }} />
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
          <div style={{ width: 22, height: 22, borderRadius: '50%', flexShrink: 0, background: colors[i], display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 800, color: '#222' }}>
            {i + 1}
          </div>
          <Link to={`/player/${p.id}`} style={{ textDecoration: 'none', color: 'inherit' }}>
            <div className="avatar" style={{ background: avatarColor(p.name), width: 28, height: 28, fontSize: 10, flexShrink: 0 }}>{initials(p.name)}</div>
          </Link>
          <span style={{ fontSize: 13, fontWeight: 600, width: 90, flexShrink: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</span>
          <HorizontalBar value={Number(p.total_points)} max={max} color={colors[i]} />
          <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--primary)', width: 36, textAlign: 'right', flexShrink: 0 }}>{p.total_points}</span>
        </div>
      ))}
    </div>
  );
}

const ACCURACY_CATEGORIES = [
  { key: 'resultPct' as keyof EnrichedStat, label: '🎯 Outcome', color: '#4caf50' },
  { key: 'exactPct' as keyof EnrichedStat, label: '⚽ Scoreline', color: '#2196f3' },
  { key: 'firstScorerPct' as keyof EnrichedStat, label: '🥅 First Goal', color: '#ff9800' },
  { key: 'goalDiffPct' as keyof EnrichedStat, label: '📐 Goal Difference', color: '#9c27b0' },
];

function AccuracyChart({ stats }: { stats: EnrichedStat[] }) {
  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ fontWeight: 800, fontSize: 14, color: 'white', marginBottom: 10 }}>📊 Accuracy by Category</div>
      {ACCURACY_CATEGORIES.map(cat => {
        const sorted = [...stats].filter(p => p[cat.key] !== null).sort((a, b) => Number(b[cat.key]) - Number(a[cat.key])).slice(0, 3);
        if (sorted.length === 0) return null;
        return (
          <div key={cat.key} className="card" style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>{cat.label}</div>
            {sorted.map(p => (
              <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 7 }}>
                <Link to={`/player/${p.id}`} style={{ textDecoration: 'none', color: 'inherit' }}>
                  <div className="avatar" style={{ background: avatarColor(p.name), width: 24, height: 24, fontSize: 9, flexShrink: 0 }}>{initials(p.name)}</div>
                </Link>
                <span style={{ fontSize: 12, fontWeight: 600, width: 80, flexShrink: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</span>
                <HorizontalBar value={Number(p[cat.key])} max={100} color={cat.color} />
                <span style={{ fontSize: 12, fontWeight: 700, color: cat.color, width: 34, textAlign: 'right', flexShrink: 0 }}>{p[cat.key]}%</span>
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
            <div className="avatar" style={{ background: avatarColor(p.name), width: 26, height: 26, fontSize: 10, flexShrink: 0 }}>{initials(p.name)}</div>
          </Link>
          <span style={{ fontSize: 13, fontWeight: 600, width: 90, flexShrink: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</span>
          <HorizontalBar value={Number(p.perfect_matches_count)} max={max} color='#f6c90e' />
          <span style={{ fontSize: 13, fontWeight: 800, color: '#e8a020', width: 20, textAlign: 'right', flexShrink: 0 }}>
            {Number(p.perfect_matches_count) > 0 ? `${p.perfect_matches_count}⭐` : '—'}
          </span>
        </div>
      ))}
    </div>
  );
}

const CHART_COLORS = ['#e53e3e', '#3182ce', '#38a169', '#d69e2e', '#805ad5', '#dd6b20', '#319795', '#e91e63'];

function RankChart({ data }: { data: { matches: { id: number; label: string }[]; players: { id: number; name: string; ranks: number[] }[] } }) {
  const { matches, players } = data;
  if (matches.length < 2 || players.length < 2) return null;

  const N = players.length;
  const MT = 12, MB = 38, ML = 22, MR = 12;
  const H = 180;
  const PLOT_H = H - MT - MB;
  const MIN_W = Math.max(matches.length * 38, 280);
  const PLOT_W = MIN_W - ML - MR;
  const xOf = (i: number) => ML + (i / (matches.length - 1)) * PLOT_W;
  const yOf = (rank: number) => MT + ((rank - 1) / Math.max(N - 1, 1)) * PLOT_H;

  return (
    <div className="card" style={{ marginBottom: 24, padding: 0, overflow: 'hidden' }}>
      <div style={{ padding: '12px 14px 4px', fontWeight: 800, fontSize: 14 }}>📈 Rank Over Time</div>
      <div style={{ padding: '0 14px 6px' }}>
        <p className="text-xs text-muted">Position after each match — 1st is best</p>
      </div>
      <div style={{ overflowX: 'auto' }}>
        <svg width={MIN_W} height={H} viewBox={`0 0 ${MIN_W} ${H}`} style={{ display: 'block' }}>
          {/* Grid lines */}
          {Array.from({ length: N }, (_, i) => {
            const y = yOf(i + 1);
            return (
              <g key={i}>
                <line x1={ML} y1={y} x2={MIN_W - MR} y2={y} stroke="rgba(0,0,0,0.06)" strokeWidth={1} />
                <text x={ML - 4} y={y + 4} textAnchor="end" fontSize={9} fontWeight={700} fill="#999">{i + 1}</text>
              </g>
            );
          })}

          {/* X-axis labels — show every Nth to avoid crowding */}
          {matches.map((m, idx) => {
            const step = Math.ceil(matches.length / 8);
            if (idx % step !== 0 && idx !== matches.length - 1) return null;
            const x = xOf(idx);
            return (
              <text key={m.id} x={x} y={H - MB + 10} textAnchor="end" fontSize={8} fill="#999"
                transform={`rotate(-40 ${x} ${H - MB + 10})`}>
                {m.label}
              </text>
            );
          })}

          {/* Player lines + dots */}
          {players.map((player, pi) => {
            const color = CHART_COLORS[pi % CHART_COLORS.length];
            const pts = player.ranks.map((rank, idx) => `${xOf(idx)},${yOf(rank)}`).join(' ');
            return (
              <g key={player.id}>
                <polyline points={pts} fill="none" stroke={color} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />
                {player.ranks.map((rank, idx) => (
                  <circle key={idx} cx={xOf(idx)} cy={yOf(rank)} r={3.5} fill={color} stroke="white" strokeWidth={1.5} />
                ))}
              </g>
            );
          })}
        </svg>
      </div>
      {/* Legend */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, padding: '8px 14px 14px' }}>
        {players.map((player, pi) => (
          <div key={player.id} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <div style={{ width: 10, height: 10, borderRadius: '50%', background: CHART_COLORS[pi % CHART_COLORS.length], flexShrink: 0 }} />
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)' }}>{player.name.split(' ')[0]}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function StatsPage() {
  const [sortKey, setSortKey] = useState<SortKey>('ppm');

  const { data, isLoading } = useQuery({
    queryKey: ['player-stats'],
    queryFn: () => leaderboardApi.playerStats(),
  });

  const { data: rankData } = useQuery({
    queryKey: ['rank-history'],
    queryFn: () => leaderboardApi.rankHistory(),
  });

  if (isLoading) return <div className="loading"><div className="spinner" /></div>;

  const raw = data?.stats ?? [];
  const stats = raw.map(enrich);
  const anyFinished = stats.some(p => Number(p.total_finished) > 0);

  const sorted = [...stats].sort((a, b) => {
    const col = COLUMNS.find(c => c.key === sortKey)!;
    const valA = col.getValue(a);
    const valB = col.getValue(b);
    if (valA === null && valB === null) return 0;
    if (valA === null) return 1;
    if (valB === null) return -1;
    return sortKey === 'defaults' ? valA - valB : valB - valA;
  });

  // Active sort column floats to position 0; rest stay in original order
  const orderedCols = [
    ...COLUMNS.filter(c => c.key === sortKey),
    ...COLUMNS.filter(c => c.key !== sortKey),
  ];

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
            {COLUMNS.map(col => (
              <button
                key={col.key}
                onClick={() => setSortKey(col.key)}
                style={{
                  fontSize: 11, fontWeight: 700, padding: '4px 10px', borderRadius: 999,
                  border: 'none', cursor: 'pointer',
                  background: sortKey === col.key ? 'var(--primary)' : 'rgba(255,255,255,0.15)',
                  color: sortKey === col.key ? 'white' : 'rgba(255,255,255,0.8)',
                }}
              >
                {col.short}
              </button>
            ))}
          </div>

          <div style={{ overflowX: 'auto', borderRadius: 12, marginBottom: 24 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', background: 'white', borderRadius: 12, overflow: 'hidden' }}>
              <thead>
                <tr style={{ background: 'var(--surface-2, rgba(0,0,0,0.05))' }}>
                  <th style={{ textAlign: 'left', padding: '10px 12px', fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap' }}>
                    Player
                  </th>
                  {orderedCols.map(col => (
                    <th key={col.key} onClick={() => setSortKey(col.key)} style={{
                      padding: '10px 8px', fontSize: 11, fontWeight: 700,
                      color: sortKey === col.key ? 'var(--primary)' : 'var(--text-muted)',
                      textTransform: 'uppercase', letterSpacing: '0.05em',
                      whiteSpace: 'nowrap', cursor: 'pointer', textAlign: 'center',
                      background: sortKey === col.key ? 'rgba(31,106,58,0.06)' : undefined,
                    }}>
                      {col.short} {sortKey === col.key ? (col.key === 'defaults' ? '▲' : '▼') : ''}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sorted.map((p, i) => (
                  <tr key={p.id} style={{ borderTop: i > 0 ? '1px solid var(--border)' : 'none' }}>
                    <td style={{ padding: '10px 12px', whiteSpace: 'nowrap' }}>
                      <Link to={`/player/${p.id}`} style={{ textDecoration: 'none', color: 'inherit', display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div className="avatar" style={{ background: avatarColor(p.name), width: 28, height: 28, fontSize: 10, flexShrink: 0 }}>{initials(p.name)}</div>
                        <span style={{ fontWeight: 700, fontSize: 13 }}>{p.name}</span>
                      </Link>
                    </td>
                    {orderedCols.map(col => (
                      <React.Fragment key={col.key}>
                        {col.render(p, col.key === sortKey)}
                      </React.Fragment>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {rankData && <RankChart data={rankData} />}
        </>
      )}
    </div>
  );
}
