import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { adminApi } from '../../api';

const ROLE_LABEL: Record<string, string> = {
  super_admin: '👑 Super',
  admin: '🛡️ Admin',
  player: '',
};

export function AdminUsers() {
  const navigate = useNavigate();
  const { data: users, isLoading } = useQuery({ queryKey: ['admin-users'], queryFn: adminApi.users });

  if (isLoading) return <div className="loading"><div className="spinner" /></div>;

  return (
    <div className="page">
      <button onClick={() => navigate('/admin')} style={{ background: 'none', border: 'none', color: 'var(--primary)', fontWeight: 600, marginBottom: 12, cursor: 'pointer' }}>← Back</button>
      <h1 style={{ fontSize: 20, marginBottom: 16 }}>👥 Users</h1>

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        {users?.map((user, i) => (
          <div key={user.id} style={{ padding: '12px 16px', borderTop: i > 0 ? '1px solid var(--border)' : 'none' }}>
            <div className="flex-between">
              <div>
                <div style={{ fontWeight: 600 }}>
                  {user.name} {ROLE_LABEL[user.role]}
                </div>
                <div className="text-muted text-sm">{user.email}</div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
