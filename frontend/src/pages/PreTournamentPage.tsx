import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { preTournamentApi } from '../api';
import { PreTournamentPrediction } from '../types';

const ALL_TEAMS = [
  'Argentina', 'Australia', 'Austria', 'Belgium', 'Brazil', 'Cameroon', 'Canada', 'Chile',
  'China', 'Colombia', 'Costa Rica', 'Croatia', 'Cuba', 'Denmark', 'Ecuador', 'Egypt',
  'England', 'France', 'Germany', 'Ghana', 'Honduras', 'Iran', 'Ivory Coast', 'Japan',
  'Mexico', 'Morocco', 'Netherlands', 'New Zealand', 'Nigeria', 'Panama', 'Paraguay',
  'Poland', 'Portugal', 'Saudi Arabia', 'Scotland', 'Senegal', 'Serbia', 'South Korea',
  'Spain', 'Switzerland', 'Turkey', 'Uruguay', 'USA', 'Venezuela',
  'Algeria', 'Croatia', 'Austria', 'Denmark',
];

const GROUPS: { label: string; key: string; teams: string[] }[] = [
  { label: 'A', key: 'a', teams: ['Mexico', 'USA', 'Canada', 'Morocco'] },
  { label: 'B', key: 'b', teams: ['Brazil', 'Argentina', 'Australia', 'Saudi Arabia'] },
  { label: 'C', key: 'c', teams: ['France', 'England', 'Senegal', 'Ecuador'] },
  { label: 'D', key: 'd', teams: ['Spain', 'Germany', 'Japan', 'Costa Rica'] },
  { label: 'E', key: 'e', teams: ['Portugal', 'Netherlands', 'Iran', 'Ghana'] },
  { label: 'F', key: 'f', teams: ['Italy', 'Belgium', 'Cameroon', 'Serbia'] },
  { label: 'G', key: 'g', teams: ['Colombia', 'South Korea', 'Poland', 'Egypt'] },
  { label: 'H', key: 'h', teams: ['Switzerland', 'Turkey', 'Ivory Coast', 'Honduras'] },
  { label: 'I', key: 'i', teams: ['Uruguay', 'Chile', 'Nigeria', 'Ivory Coast'] },
  { label: 'J', key: 'j', teams: ['Croatia', 'Algeria', 'Venezuela', 'Cameroon'] },
  { label: 'K', key: 'k', teams: ['Denmark', 'Scotland', 'China', 'New Zealand'] },
  { label: 'L', key: 'l', teams: ['Austria', 'Paraguay', 'Panama', 'Cuba'] },
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
    mutationFn: () => preTournamentApi.save({ ...form }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pre-tournament'] });
      setSaved(true);
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
