import { useEffect, useState } from 'react';
import { isIOS, isStandalone, isPushSupported, subscribeToPush } from '../utils/push';

const A2HS_DISMISSED_KEY = 'mondo_a2hs_dismissed';
const PUSH_PROMPTED_KEY = 'mondo_push_prompted';

// Two-stage onboarding for push notifications:
//   1. If iOS Safari + not installed as A2HS → BIG unmissable banner with install steps.
//      Without A2HS, iOS silently refuses Notification.requestPermission.
//   2. After A2HS install (or on Android/desktop), prompt for notification permission
//      once. Permission state persists so the prompt doesn't nag forever.
export function PushOnboarding() {
  const [showA2HS, setShowA2HS] = useState(false);
  const [showPushPrompt, setShowPushPrompt] = useState(false);

  useEffect(() => {
    const ios = isIOS();
    const standalone = isStandalone();
    const pushSupported = isPushSupported();
    const a2hsDismissed = localStorage.getItem(A2HS_DISMISSED_KEY) === '1';
    const pushPrompted = localStorage.getItem(PUSH_PROMPTED_KEY) === '1';

    if (ios && !standalone && !a2hsDismissed) {
      setShowA2HS(true);
      return;
    }
    // Prompt for push permission once if we *can* push and haven't asked yet.
    // For iOS users this requires standalone (A2HS already installed).
    if (pushSupported && !pushPrompted && Notification.permission === 'default') {
      if (!ios || standalone) setShowPushPrompt(true);
    }
  }, []);

  async function enablePush() {
    localStorage.setItem(PUSH_PROMPTED_KEY, '1');
    setShowPushPrompt(false);
    await subscribeToPush();
  }

  function dismissPush() {
    localStorage.setItem(PUSH_PROMPTED_KEY, '1');
    setShowPushPrompt(false);
  }

  function dismissA2HS() {
    localStorage.setItem(A2HS_DISMISSED_KEY, '1');
    setShowA2HS(false);
  }

  if (showA2HS) {
    return (
      <div
        style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)',
          zIndex: 9999, display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
        }}
      >
        <div
          style={{
            background: 'linear-gradient(180deg, #ffd54f 0%, #ff9800 100%)',
            color: '#1a1a1a', borderRadius: '24px 24px 0 0',
            padding: '24px 20px 28px', width: '100%', maxWidth: 480,
            boxShadow: '0 -10px 40px rgba(0,0,0,0.5)',
            animation: 'slideUp 0.3s ease-out',
          }}
        >
          <div style={{ fontSize: 48, textAlign: 'center', marginBottom: 8 }}>📲⚽</div>
          <div style={{ fontSize: 22, fontWeight: 900, textAlign: 'center', marginBottom: 6 }}>
            Install Mondo on your phone!
          </div>
          <div style={{ fontSize: 14, textAlign: 'center', marginBottom: 18, fontWeight: 600 }}>
            Get daily reminders so you never miss a prediction
          </div>
          <div style={{ background: 'rgba(255,255,255,0.6)', borderRadius: 12, padding: 14, marginBottom: 14 }}>
            <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 8 }}>How to install:</div>
            <ol style={{ margin: 0, paddingLeft: 20, fontSize: 13, lineHeight: 1.7 }}>
              <li>Tap the <strong>Share</strong> button <span style={{ fontSize: 16 }}>⬆️</span> at the bottom of Safari</li>
              <li>Scroll down and tap <strong>Add to Home Screen</strong></li>
              <li>Tap <strong>Add</strong> in the top-right</li>
              <li>Open Mondo from your home screen 🎉</li>
            </ol>
          </div>
          <button
            onClick={dismissA2HS}
            style={{
              width: '100%', background: 'rgba(0,0,0,0.1)', border: 'none',
              padding: '10px 14px', borderRadius: 8, fontWeight: 700,
              fontSize: 13, color: '#1a1a1a', cursor: 'pointer',
            }}
          >
            Maybe later
          </button>
        </div>
      </div>
    );
  }

  if (showPushPrompt) {
    return (
      <div className="card" style={{ marginBottom: 16, padding: 16, background: 'linear-gradient(135deg, #1f6a3a 0%, #2e8b4e 100%)', color: 'white' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ fontSize: 32, flexShrink: 0 }}>🔔</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 800, fontSize: 14, marginBottom: 4 }}>Daily reminders</div>
            <div style={{ fontSize: 12, opacity: 0.9, lineHeight: 1.4 }}>
              Get a notification each day if there are matches you haven't predicted yet.
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
          <button
            onClick={enablePush}
            style={{ flex: 1, background: 'white', color: '#1f6a3a', border: 'none', padding: '10px', borderRadius: 8, fontWeight: 800, fontSize: 13, cursor: 'pointer' }}
          >
            Enable
          </button>
          <button
            onClick={dismissPush}
            style={{ background: 'rgba(255,255,255,0.15)', color: 'white', border: 'none', padding: '10px 14px', borderRadius: 8, fontWeight: 700, fontSize: 13, cursor: 'pointer' }}
          >
            Not now
          </button>
        </div>
      </div>
    );
  }

  return null;
}
