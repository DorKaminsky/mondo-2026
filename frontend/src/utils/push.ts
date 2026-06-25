import { api } from '../api/client';

// VAPID public key is fetched once at subscribe time. base64url → Uint8Array per spec.
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const b64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(b64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

export function isPushSupported(): boolean {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

export function isStandalone(): boolean {
  // iOS Safari: navigator.standalone. Other browsers: display-mode media query.
  return (
    (window.matchMedia?.('(display-mode: standalone)').matches ?? false) ||
    // iOS-specific
    (window.navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

export function isIOS(): boolean {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as unknown as { MSStream?: unknown }).MSStream;
}

// Register the service worker once. Safe to call multiple times.
export async function registerSW(): Promise<ServiceWorkerRegistration | null> {
  if (!('serviceWorker' in navigator)) return null;
  try {
    return await navigator.serviceWorker.register('/sw.js');
  } catch (err) {
    console.error('SW registration failed', err);
    return null;
  }
}

export async function subscribeToPush(): Promise<boolean> {
  if (!isPushSupported()) return false;

  // iOS will refuse Notification.requestPermission unless installed as A2HS
  if (isIOS() && !isStandalone()) return false;

  const reg = await registerSW();
  if (!reg) return false;

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return false;

  const { data } = await api.get<{ key: string }>('/push/vapid-public-key');
  if (!data.key) return false;

  const sub = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(data.key).buffer as ArrayBuffer,
  });

  const json = sub.toJSON();
  await api.post('/push/subscribe', {
    endpoint: json.endpoint,
    keys: json.keys,
  });

  return true;
}
