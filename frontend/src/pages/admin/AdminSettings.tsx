import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { adminApi } from '../../api';

export function AdminSettings() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data: settings, isLoading } = useQuery({ queryKey: ['admin-settings'], queryFn: adminApi.settings });
  const [form, setForm] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (settings) setForm(settings);
  }, [settings]);

  const save = useMutation({
    mutationFn: () => adminApi.updateSettings(form),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-settings'] });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    },
  });

  if (isLoading) return <div className="loading"><div className="spinner" /></div>;

  return (
    <div className="page">
      <button onClick={() => navigate('/admin')} style={{ background: 'none', border: 'none', color: 'var(--primary)', fontWeight: 600, marginBottom: 12, cursor: 'pointer' }}>← Back</button>
      <h1 style={{ fontSize: 20, marginBottom: 16 }}>🔧 Settings</h1>

      <div className="card">
        <div className="form-group">
          <label>Pre-Tournament Deadline (UTC)</label>
          <input
            type="datetime-local"
            value={form.pre_tournament_deadline?.slice(0, 16) ?? ''}
            onChange={e => setForm(f => ({ ...f, pre_tournament_deadline: new Date(e.target.value).toISOString() }))}
          />
        </div>
        <div className="form-group">
          <label>Announcement Banner (shown to all users)</label>
          <input
            value={form.announcement_banner ?? ''}
            onChange={e => setForm(f => ({ ...f, announcement_banner: e.target.value }))}
            placeholder="e.g. Final deadline in 1 hour!"
          />
        </div>
        <div className="form-group">
          <label>Lock All Predictions</label>
          <select
            value={form.predictions_locked ?? 'false'}
            onChange={e => setForm(f => ({ ...f, predictions_locked: e.target.value }))}
          >
            <option value="false">Unlocked</option>
            <option value="true">Locked</option>
          </select>
        </div>
        <button className="btn btn-primary" onClick={() => save.mutate()} disabled={save.isPending}>
          {saved ? '✓ Saved!' : 'Save Settings'}
        </button>
      </div>
    </div>
  );
}
