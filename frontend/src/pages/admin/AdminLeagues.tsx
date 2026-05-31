import { useState, FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { leaguesApi } from '../../api';

export function AdminLeagues() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data: leagues, isLoading } = useQuery({ queryKey: ['leagues'], queryFn: leaguesApi.list });

  const [newName, setNewName] = useState('');
  const [error, setError] = useState('');

  const createMut = useMutation({
    mutationFn: (name: string) => leaguesApi.create(name),
    onSuccess: () => { setNewName(''); setError(''); qc.invalidateQueries({ queryKey: ['leagues'] }); },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setError(msg ?? 'Could not create league');
    },
  });

  const regenMut = useMutation({
    mutationFn: (leagueId: number) => leaguesApi.regenerateCode(leagueId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['leagues'] }),
  });

  function handleCreate(e: FormEvent) {
    e.preventDefault();
    if (newName.trim().length < 2) { setError('Name too short'); return; }
    createMut.mutate(newName.trim());
  }

  function copyCode(code: string) {
    navigator.clipboard.writeText(code).catch(() => {});
  }

  if (isLoading) return <div className="loading"><div className="spinner" /></div>;

  return (
    <div className="page">
      <button onClick={() => navigate('/admin')} style={{ background: 'none', border: 'none', color: 'var(--primary)', fontWeight: 600, marginBottom: 12, cursor: 'pointer' }}>← Back</button>
      <h1 style={{ fontSize: 20, marginBottom: 16, color: 'white' }}>🏟️ Leagues</h1>

      <div className="card" style={{ marginBottom: 16 }}>
        <p style={{ fontWeight: 700, marginBottom: 8 }}>Create a league</p>
        <form onSubmit={handleCreate} style={{ display: 'flex', gap: 8 }}>
          <input
            value={newName}
            onChange={e => setNewName(e.target.value)}
            placeholder="League name (e.g. Tel Aviv Crew)"
            style={{ flex: 1 }}
            maxLength={80}
          />
          <button type="submit" className="btn btn-primary btn-sm" disabled={createMut.isPending}>
            {createMut.isPending ? '...' : 'Create'}
          </button>
        </form>
        {error && <p className="text-sm" style={{ color: 'var(--red)', marginTop: 6 }}>{error}</p>}
      </div>

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        {leagues && leagues.length === 0 && (
          <div style={{ padding: 16, textAlign: 'center' }} className="text-muted">No leagues yet.</div>
        )}
        {leagues?.map((l, i) => (
          <div key={l.id} style={{ padding: '14px 16px', borderTop: i > 0 ? '1px solid var(--border)' : 'none' }}>
            <div className="flex-between" style={{ alignItems: 'flex-start' }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 15 }}>{l.name}</div>
                <div className="text-muted text-xs" style={{ marginTop: 2 }}>
                  {l.member_count ?? 0} player{l.member_count === 1 ? '' : 's'} · {l.admin_count ?? 0} admin{l.admin_count === 1 ? '' : 's'}
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <code
                  onClick={() => l.invite_code && copyCode(l.invite_code)}
                  title="Click to copy"
                  style={{ fontSize: 16, fontWeight: 800, letterSpacing: '0.15em', cursor: 'pointer', fontFamily: 'monospace' }}
                >
                  {l.invite_code}
                </code>
                <div>
                  <button
                    className="btn-sm"
                    onClick={() => regenMut.mutate(l.id)}
                    style={{ background: 'none', border: 'none', color: 'var(--primary)', fontSize: 11, marginTop: 4, cursor: 'pointer' }}
                    disabled={regenMut.isPending}
                  >
                    🔄 Regenerate
                  </button>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
