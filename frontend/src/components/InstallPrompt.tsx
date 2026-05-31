import { useEffect, useState } from 'react';

const DISMISS_KEY = 'pwa-install-banner-dismissed';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

function isStandalone(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    // iOS Safari
    (window.navigator as { standalone?: boolean }).standalone === true
  );
}

function isIOS(): boolean {
  const ua = window.navigator.userAgent;
  return /iPhone|iPad|iPod/.test(ua) && !(window as { MSStream?: unknown }).MSStream;
}

export function InstallPrompt() {
  const [dismissed, setDismissed] = useState(() => localStorage.getItem(DISMISS_KEY) === 'true');
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [showIosHint, setShowIosHint] = useState(false);

  useEffect(() => {
    if (isStandalone()) return; // already installed

    function onBeforeInstall(e: Event) {
      e.preventDefault();
      setInstallEvent(e as BeforeInstallPromptEvent);
    }

    window.addEventListener('beforeinstallprompt', onBeforeInstall);

    // For iOS, no event — just check device + show hint after a short delay
    if (isIOS()) {
      const t = setTimeout(() => setShowIosHint(true), 800);
      return () => {
        clearTimeout(t);
        window.removeEventListener('beforeinstallprompt', onBeforeInstall);
      };
    }

    return () => window.removeEventListener('beforeinstallprompt', onBeforeInstall);
  }, []);

  function dismiss() {
    localStorage.setItem(DISMISS_KEY, 'true');
    setDismissed(true);
  }

  async function install() {
    if (!installEvent) return;
    await installEvent.prompt();
    const { outcome } = await installEvent.userChoice;
    if (outcome === 'accepted') dismiss();
    setInstallEvent(null);
  }

  if (dismissed || isStandalone()) return null;

  // Android / Chrome path — proper install button
  if (installEvent) {
    return (
      <div
        style={{
          marginBottom: 14,
          padding: '12px 14px',
          background: 'rgba(255,255,255,0.12)',
          border: '1px solid rgba(255,255,255,0.25)',
          borderRadius: 12,
          color: 'white',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 10,
        }}
      >
        <div>
          <div style={{ fontSize: 13, fontWeight: 700 }}>📱 Install this app</div>
          <div style={{ fontSize: 11, opacity: 0.75, marginTop: 2 }}>One tap to your home screen</div>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <button
            onClick={install}
            style={{
              background: 'white', color: 'var(--primary)', border: 'none',
              padding: '6px 12px', borderRadius: 999, fontWeight: 700, fontSize: 12, cursor: 'pointer',
            }}
          >
            Install
          </button>
          <button
            onClick={dismiss}
            aria-label="Dismiss"
            style={{
              background: 'rgba(255,255,255,0.15)', color: 'white', border: 'none',
              padding: '6px 10px', borderRadius: 999, fontSize: 12, cursor: 'pointer',
            }}
          >
            ✕
          </button>
        </div>
      </div>
    );
  }

  // iOS path — instructions, no API
  if (showIosHint) {
    return (
      <div
        style={{
          marginBottom: 14,
          padding: '12px 14px',
          background: 'rgba(255,255,255,0.12)',
          border: '1px solid rgba(255,255,255,0.25)',
          borderRadius: 12,
          color: 'white',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 10,
        }}
      >
        <div style={{ fontSize: 12 }}>
          <div style={{ fontWeight: 700, marginBottom: 2 }}>📱 Add to Home Screen</div>
          <div style={{ opacity: 0.85 }}>Tap <b>Share</b> → <b>Add to Home Screen</b></div>
        </div>
        <button
          onClick={dismiss}
          aria-label="Dismiss"
          style={{
            background: 'rgba(255,255,255,0.15)', color: 'white', border: 'none',
            padding: '6px 10px', borderRadius: 999, fontSize: 12, cursor: 'pointer',
          }}
        >
          ✕
        </button>
      </div>
    );
  }

  return null;
}
