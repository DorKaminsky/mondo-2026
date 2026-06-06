import { useState, useEffect, useMemo, FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { adminApi, matchesApi } from '../../api';

const GROUP_KEYS: { label: string; key: string }[] = [
  { label: 'A', key: 'a' }, { label: 'B', key: 'b' }, { label: 'C', key: 'c' },
  { label: 'D', key: 'd' }, { label: 'E', key: 'e' }, { label: 'F', key: 'f' },
  { label: 'G', key: 'g' }, { label: 'H', key: 'h' }, { label: 'I', key: 'i' },
  { label: 'J', key: 'j' }, { label: 'K', key: 'k' }, { label: 'L', key: 'l' },
];

export function AdminPreTournament() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data: actuals, isLoading } = useQuery({
    queryKey: ['admin-pre-tournament-results'],
    queryFn: adminApi.preTournamentResults,
  });

  // Derive groups + all-teams from real fixture data — no hardcoded lists
  const { data: matches } = useQuery({ queryKey: ['matches'], queryFn: matchesApi.all });
  const GROUPS = useMemo(() => {
    if (!matches) return GROUP_KEYS.map(g => ({ ...g, teams: [] as string[] }));
    return GROUP_KEYS.map(g => {
      const teams = new Set<string>();
      for (const m of matches) {
        if (m.round !== 'group' || m.group_name !== g.key) continue;
        if (!m.home_team.startsWith('TBD')) teams.add(m.home_team);
        if (!m.away_team.startsWith('TBD')) teams.add(m.away_team);
      }
      return { ...g, teams: [...teams].sort() };
    });
  }, [matches]);
  const ALL_TEAMS = useMemo(() => {
    const all = new Set<string>();
    for (const g of GROUPS) for (const t of g.teams) all.add(t);
    return [...all].sort();
  }, [GROUPS]);

  const [form, setForm] = useState({
    winner_team: '',
    runner_up_team: '',
    top_scorer_name: '',
    top_assister_name: '',
    groups: {} as Record<string, string>,
  });
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!actuals) return;
    const groups: Record<string, string> = {};
    for (const g of GROUPS) {
      groups[`group_${g.key}_first`] = actuals[`pt_actual_group_${g.key}_first`] ?? '';
      groups[`group_${g.key}_second`] = actuals[`pt_actual_group_${g.key}_second`] ?? '';
    }
    setForm({
      winner_team: actuals.pt_actual_winner ?? '',
      runner_up_team: actuals.pt_actual_runner_up ?? '',
      top_scorer_name: actuals.pt_actual_top_scorer ?? '',
      top_assister_name: actuals.pt_actual_top_assister ?? '',
      groups,
    });
  }, [actuals]);

  const save = useMutation({
    mutationFn: () => adminApi.setPreTournamentResults(form),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-pre-tournament-results'] });
      qc.invalidateQueries({ queryKey: ['leaderboard'] });
      setSaved(true);
      setError('');
      setTimeout(() => setSaved(false), 2500);
    },
    onError: (e: unknown) => {
      const msg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setError(msg ?? 'Failed to save');
    },
  });

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!confirm('This will lock all pre-tournament predictions and score them. Continue?')) return;
    save.mutate();
  }

  if (isLoading) return <div className="loading"><div className="spinner" /></div>;

  return (
    <div className="page">
      <button onClick={() => navigate('/admin')} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.85)', fontWeight: 600, marginBottom: 12, cursor: 'pointer' }}>← Back</button>
      <h1 style={{ fontSize: 22, fontWeight: 900, color: 'white', marginBottom: 8 }}>🏆 Pre-Tournament Results</h1>
      <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: 13, marginBottom: 16 }}>
        Enter the actual outcomes once known. Saves and scores immediately. Editable later if you mistype.
      </p>

      {error && <div className="alert alert-danger">{error}</div>}
      {saved && <div className="alert alert-success">✅ Saved and re-scored</div>}

      <form onSubmit={handleSubmit}>
        <div className="card">
          <h3 style={{ marginBottom: 12, fontSize: 14 }}>Tournament Winner & Runner-up</h3>
          <div className="form-group">
            <label>Tournament Winner <span className="badge badge-blue">16 pts</span></label>
            <select value={form.winner_team} onChange={e => setForm(f => ({ ...f, winner_team: e.target.value }))}>
              <option value="">— Select team —</option>
              {ALL_TEAMS.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label>Runner-up <span className="badge badge-blue">8 pts</span></label>
            <select value={form.runner_up_team} onChange={e => setForm(f => ({ ...f, runner_up_team: e.target.value }))}>
              <option value="">— Select team —</option>
              {ALL_TEAMS.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
        </div>

        <div className="card">
          <h3 style={{ marginBottom: 12, fontSize: 14 }}>Top Scorer & Assister</h3>
          <div className="form-group">
            <label>Top Scorer (player name) <span className="badge badge-blue">12 pts</span></label>
            <input
              value={form.top_scorer_name}
              onChange={e => setForm(f => ({ ...f, top_scorer_name: e.target.value }))}
              placeholder="e.g. Kylian Mbappé"
            />
            <p className="text-muted text-xs" style={{ marginTop: 4 }}>
              Match is case-insensitive but must match exactly. Tip: use the same spelling as users were prompted ("e.g. Kylian Mbappé").
            </p>
          </div>
          <div className="form-group">
            <label>Top Assister (player name) <span className="badge badge-blue">12 pts</span></label>
            <input
              value={form.top_assister_name}
              onChange={e => setForm(f => ({ ...f, top_assister_name: e.target.value }))}
              placeholder="e.g. Kevin De Bruyne"
            />
          </div>
        </div>

        {GROUPS.map(g => (
          <div key={g.key} className="card">
            <h3 style={{ marginBottom: 8, fontSize: 14 }}>Group {g.label}</h3>
            <p className="text-muted text-xs" style={{ marginBottom: 10 }}>
              Teams: {g.teams.join(', ')}
            </p>
            <div className="form-group">
              <label>1st Place <span className="badge badge-blue">4 pts</span></label>
              <select
                value={form.groups[`group_${g.key}_first`] ?? ''}
                onChange={e => setForm(f => ({ ...f, groups: { ...f.groups, [`group_${g.key}_first`]: e.target.value } }))}
              >
                <option value="">— Select team —</option>
                {g.teams.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label>2nd Place <span className="badge badge-blue">4 pts</span></label>
              <select
                value={form.groups[`group_${g.key}_second`] ?? ''}
                onChange={e => setForm(f => ({ ...f, groups: { ...f.groups, [`group_${g.key}_second`]: e.target.value } }))}
              >
                <option value="">— Select team —</option>
                {g.teams.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
          </div>
        ))}

        <button type="submit" className="btn btn-primary" disabled={save.isPending} style={{ marginTop: 8, marginBottom: 24 }}>
          {save.isPending ? 'Saving and scoring…' : '💾 Save Results & Score'}
        </button>
      </form>
    </div>
  );
}
