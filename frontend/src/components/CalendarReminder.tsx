import { useState } from 'react';
import { downloadIcs } from '../utils/calendar';

interface Props {
  matchId: number;
  homeTeam: string;
  awayTeam: string;
  kickoffUtc: string;
}

const PRESETS = [
  { label: '15 min', minutes: 15 },
  { label: '1 hour', minutes: 60 },
  { label: '3 hours', minutes: 180 },
  { label: '1 day', minutes: 1440 },
];

export function CalendarReminder({ matchId, homeTeam, awayTeam, kickoffUtc }: Props) {
  const [open, setOpen] = useState(false);

  function pick(minutesBeforeDeadline: number) {
    downloadIcs({ matchId, homeTeam, awayTeam, kickoffUtc, minutesBeforeDeadline });
    setOpen(false);
  }

  return (
    <div style={{ position: 'relative', display: 'inline-block' }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          background: 'rgba(255,255,255,0.12)',
          border: '1px solid rgba(255,255,255,0.25)',
          color: 'white',
          padding: '6px 12px',
          borderRadius: 999,
          fontSize: 12,
          fontWeight: 700,
          cursor: 'pointer',
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
        }}
      >
        <span>📅</span>
        <span>Remind me</span>
      </button>

      {open && (
        <>
          {/* Click-outside backdrop */}
          <div
            onClick={() => setOpen(false)}
            style={{ position: 'fixed', inset: 0, zIndex: 100 }}
          />
          <div
            style={{
              position: 'absolute',
              top: 'calc(100% + 6px)',
              right: 0,
              zIndex: 101,
              background: 'white',
              borderRadius: 10,
              boxShadow: '0 8px 24px rgba(0,0,0,0.25)',
              padding: '6px',
              minWidth: 180,
            }}
          >
            <div style={{ fontSize: 11, color: 'var(--text-muted)', padding: '6px 10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Remind me before deadline
            </div>
            {PRESETS.map(({ label, minutes }) => (
              <button
                key={minutes}
                onClick={() => pick(minutes)}
                style={{
                  display: 'block',
                  width: '100%',
                  textAlign: 'left',
                  background: 'none',
                  border: 'none',
                  padding: '8px 10px',
                  fontSize: 13,
                  cursor: 'pointer',
                  borderRadius: 6,
                  color: 'var(--text)',
                  fontWeight: 600,
                }}
                onMouseDown={e => e.preventDefault()}
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--green-light)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
              >
                {label} before
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
