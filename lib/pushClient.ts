// Browser-only helpers shared by the push opt-in components.

export function decodeApplicationServerKey(value: string): ArrayBuffer {
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64 + '='.repeat((4 - base64.length % 4) % 4);
  const binary = window.atob(padded);
  const buffer = new ArrayBuffer(binary.length);
  const bytes = new Uint8Array(buffer);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return buffer;
}

function sameKey(left: ArrayBuffer | null, right: ArrayBuffer): boolean {
  if (!left || left.byteLength !== right.byteLength) return false;
  const a = new Uint8Array(left);
  const b = new Uint8Array(right);
  for (let index = 0; index < a.length; index += 1) if (a[index] !== b[index]) return false;
  return true;
}

/** In-app browsers (Telegram, Facebook, Instagram, WhatsApp...) can't do web push. */
export function isInAppBrowser(): boolean {
  return /telegram|fban|fbav|fb_iab|instagram|line\/|whatsapp|snapchat|tiktok|musical_ly|; wv\)/i
    .test(navigator.userAgent);
}

export function canUseWebPush(): boolean {
  return window.isSecureContext && 'serviceWorker' in navigator &&
    'PushManager' in window && 'Notification' in window;
}

export async function registerPushWorker(): Promise<ServiceWorkerRegistration> {
  await navigator.serviceWorker.register('/sw.js', { scope: '/', updateViaCache: 'none' });
  return navigator.serviceWorker.ready;
}

/**
 * Returns a subscription created with the CURRENT public VAPID key.
 * A subscription made with an older key is rejected by the push service (403),
 * which looked like "notifications never arrive" — so it is replaced here.
 */
export async function getOrCreateSubscription(
  registration: ServiceWorkerRegistration,
  publicKey: string,
): Promise<PushSubscription> {
  const key = decodeApplicationServerKey(publicKey);
  const existing = await registration.pushManager.getSubscription();
  if (existing) {
    if (sameKey(existing.options.applicationServerKey, key)) return existing;
    await existing.unsubscribe().catch(() => undefined);
  }
  return registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
}
