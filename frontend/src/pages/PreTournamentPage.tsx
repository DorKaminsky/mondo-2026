import { useState, useEffect, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { preTournamentApi, matchesApi } from '../api';
import { PreTournamentPrediction } from '../types';

// 12 group labels A..L. Team membership is derived from the matches API at
// runtime so the pre-tournament page always reflects the real WC2026 draw
// (no hardcoded — and previously wrong — group assignments).
const GROUP_KEYS: { label: string; key: string }[] = [
  { label: 'A', key: 'a' }, { label: 'B', key: 'b' }, { label: 'C', key: 'c' },
  { label: 'D', key: 'd' }, { label: 'E', key: 'e' }, { label: 'F', key: 'f' },
  { label: 'G', key: 'g' }, { label: 'H', key: 'h' }, { label: 'I', key: 'i' },
  { label: 'J', key: 'j' }, { label: 'K', key: 'k' }, { label: 'L', key: 'l' },
];

type FormData = Partial<PreTournamentPrediction>;

function TeamSelect({ label, value, onChange, teams, pts }: {
  label: string; value: string; onChange: (v: string) => void; teams: string[]; pts: string;
}) {
  return (
    <div className="form-group">
      <label>{label} <span className="badge badge-blue">{pts}</span></label>
      <select value={value} onChange={e => onChange(e.target.value)}>
        <option value="">— Select team —</option>
        {teams.map(t => <option key={t} value={t}>{t}</option>)}
      </select>
    </div>
  );
}

export function PreTournamentPage() {
  const qc = useQueryClient();
  const { data: existing, isLoading } = useQuery({
    queryKey: ['pre-tournament'],
    queryFn: preTournamentApi.get,
  });

  // Derive groups + the global team list from the matches table —
  // the canonical source of truth for the WC2026 draw.
  const { data: matches } = useQuery({ queryKey: ['matches'], queryFn: matchesApi.all });

  const GROUPS = useMemo(() => {
    if (!matches) return GROUP_KEYS.map(g => ({ ...g, teams: [] as string[] }));
    return GROUP_KEYS.map(g => {
      const teams = new Set<string>();
      for (const m of matches) {
        if (m.round !== 'group' || m.group_name !== g.key) continue;
        // Skip TBD placeholders (shouldn't happen for group stage but be safe)
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

  const emptyForm: FormData = {
    winner_team: '', runner_up_team: '',
    top_scorer_name: '', top_scorer_team: '',
    top_assister_name: '', top_assister_team: '',
    ...Object.fromEntries(GROUPS.flatMap(g => [`group_${g.key}_first`, `group_${g.key}_second`].map(k => [k, '']))),
  };

  const [form, setForm] = useState<FormData>(emptyForm);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (existing) setForm({ ...emptyForm, ...existing });
  }, [existing]);

  const save = useMutation({
    mutationFn: () => {
      // Send only the fields the backend accepts. The `existing` object from the
      // server includes DB metadata (id, user_id, submitted_at, is_final) that
      // Joi will reject with "id is not allowed" if we forward them.
      const allowedKeys: (keyof FormData)[] = [
        'winner_team', 'runner_up_team',
        'top_scorer_name', 'top_assister_name',
        ...GROUPS.flatMap(g => [`group_${g.key}_first`, `group_${g.key}_second`] as (keyof FormData)[]),
      ];
      const payload: Record<string, unknown> = {};
      for (const k of allowedKeys) payload[k as string] = form[k] ?? '';
      return preTournamentApi.save(payload);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pre-tournament'] });
      setSaved(true);
      setError('');
      setTimeout(() => setSaved(false), 2000);
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setError(msg ?? 'Failed to save');
    },
  });

  const set = (key: keyof FormData) => (value: string) => setForm(f => ({ ...f, [key]: value }));

  if (isLoading) return <div className="loading"><div className="spinner" /></div>;

  return (
    <div className="page">
      <h1 style={{ fontSize: 20, marginBottom: 4 }}>Pre-Tournament Predictions</h1>
      <p className="text-muted text-sm" style={{ marginBottom: 16 }}>
        Deadline: June 11, 2026 at 14:00 — freely editable until then
      </p>

      {error && <div className="alert alert-danger">{error}</div>}

      <div className="card">
        <h3 style={{ marginBottom: 16 }}>Tournament Winner & Runner-up</h3>
        <TeamSelect label="Tournament Winner" value={form.winner_team ?? ''} onChange={set('winner_team')} teams={ALL_TEAMS} pts="16 pts" />
        <TeamSelect label="Runner-up" value={form.runner_up_team ?? ''} onChange={set('runner_up_team')} teams={ALL_TEAMS} pts="8 pts" />
      </div>

      <div className="card">
        <h3 style={{ marginBottom: 16 }}>Top Scorer</h3>
        <div className="form-group">
          <label>Player Name <span className="badge badge-blue">12 pts</span></label>
          <input value={form.top_scorer_name ?? ''} onChange={e => set('top_scorer_name')(e.target.value)}
            placeholder="e.g. Kylian Mbappé" />
        </div>
      </div>

      <div className="card">
        <h3 style={{ marginBottom: 16 }}>Top Assister</h3>
        <div className="form-group">
          <label>Player Name <span className="badge badge-blue">12 pts</span></label>
          <input value={form.top_assister_name ?? ''} onChange={e => set('top_assister_name')(e.target.value)}
            placeholder="e.g. Bruno Fernandes" />
        </div>
      </div>

      {GROUPS.map(group => (
        <div key={group.key} className="card">
          <h3 style={{ marginBottom: 12 }}>Group {group.label}</h3>
          <p className="text-muted text-sm" style={{ marginBottom: 12 }}>
            Teams: {group.teams.join(', ')}
          </p>
          <TeamSelect
            label="1st Place"
            value={(form as Record<string, string>)[`group_${group.key}_first`] ?? ''}
            onChange={set(`group_${group.key}_first` as keyof FormData)}
            teams={group.teams}
            pts="4 pts"
          />
          <TeamSelect
            label="2nd Place"
            value={(form as Record<string, string>)[`group_${group.key}_second`] ?? ''}
            onChange={set(`group_${group.key}_second` as keyof FormData)}
            teams={group.teams}
            pts="4 pts"
          />
        </div>
      ))}

      <div style={{ marginTop: 8, marginBottom: 24 }}>
        <button
          className="btn btn-primary"
          onClick={() => save.mutate()}
          disabled={save.isPending}
        >
          {save.isPending ? 'Saving...' : saved ? '✓ Saved!' : 'Save Predictions'}
        </button>
      </div>
    </div>
  );
}
