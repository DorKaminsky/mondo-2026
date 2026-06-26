import { useDirtyForm } from '../contexts/DirtyFormContext';

// Global unsaved-changes modal. Fires whenever any consumer calls
// requestNav() while dirty — covers BottomNav taps and any other in-app
// navigation routed through the DirtyFormContext.
export function UnsavedChangesModal() {
  const { pendingNav, cancelNav, confirmNav } = useDirtyForm();
  if (!pendingNav) return null;

  return (
    <div
      onClick={cancelNav}
      style={{
        position: 'fixed', inset: 0,
        background: 'rgba(0,0,0,0.6)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 20, zIndex: 1001,
        backdropFilter: 'blur(2px)',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: 'white',
          borderRadius: 16,
          maxWidth: 360, width: '100%',
          boxShadow: '0 20px 50px rgba(0,0,0,0.4)',
          overflow: 'hidden',
        }}
      >
        <div style={{
          background: 'linear-gradient(135deg, #f9ca24 0%, #e8a020 100%)',
          padding: '18px 20px',
          display: 'flex', alignItems: 'center', gap: 10,
        }}>
          <span style={{ fontSize: 28 }}>⚠️</span>
          <div style={{ fontWeight: 800, fontSize: 17, color: 'white' }}>
            Unsaved prediction
          </div>
        </div>
        <div style={{ padding: 20 }}>
          <p style={{ fontSize: 14, lineHeight: 1.5, marginBottom: 18, color: 'var(--text)' }}>
            You have changes that haven't been saved. If you leave now, your prediction won't be recorded.
          </p>
          <div style={{ display: 'flex', gap: 10 }}>
            <button
              onClick={confirmNav}
              style={{
                flex: 1, padding: '12px', borderRadius: 10,
                border: '2px solid var(--border)',
                background: 'white',
                color: 'var(--text)',
                fontWeight: 700, fontSize: 14,
                cursor: 'pointer',
              }}
            >
              Leave anyway
            </button>
            <button
              onClick={cancelNav}
              style={{
                flex: 1, padding: '12px', borderRadius: 10,
                border: 'none',
                background: 'var(--primary)',
                color: 'white',
                fontWeight: 800, fontSize: 14,
                cursor: 'pointer',
              }}
            >
              Stay & save
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
