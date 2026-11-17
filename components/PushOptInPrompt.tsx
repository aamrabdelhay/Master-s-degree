'use client';

import { useEffect, useState } from 'react';

const DISMISSED_KEY = 'lawdiploma:push-prompt-dismissed:v1';
type NavigatorWithStandalone = Navigator & { standalone?: boolean };

function decodeKey(value: string): ArrayBuffer {
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64 + '='.repeat((4 - base64.length % 4) % 4);
  const binary = window.atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes.buffer;
}

function errorMessage(value: unknown): string {
  if (typeof value === 'object' && value !== null &&
      typeof (value as Record<string, unknown>).error === 'string') {
    return (value as { error: string }).error;
  }
  return 'مش قادرين نفعل التنبيهات دلوقتي.';
}

export default function PushOptInPrompt() {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || '';
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [iosNeedsHome, setIosNeedsHome] = useState(false);
  const [hasSubscription, setHasSubscription] = useState(false);

  useEffect(() => {
    if (!publicKey || !window.isSecureContext || !('serviceWorker' in navigator) ||
        !('PushManager' in window) || !('Notification' in window)) return;

    let mounted = true;
    const ios = /iphone|ipad|ipod/i.test(navigator.userAgent) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    const nav = navigator as NavigatorWithStandalone;
    const standalone = nav.standalone === true || window.matchMedia('(display-mode: standalone)').matches;
    if (ios && !standalone) {
      setIosNeedsHome(true);
    }

    if (Notification.permission === 'denied') return;
    if (Notification.permission === 'granted' && !(ios && !standalone)) {
      void navigator.serviceWorker.register('/sw.js', { scope: '/' }).then(async (registration) => {
        const subscription = await registration.pushManager.getSubscription();
        if (!subscription || !mounted) return;
        setHasSubscription(true);
        void fetch('/api/push/subscribe', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ subscription: subscription.toJSON(), preference: { mode: 'all', subjectIds: [] } }),
        }).catch(() => undefined);
      }).catch(() => undefined);
    }

    try {
      if (!window.localStorage.getItem(DISMISSED_KEY)) {
        const timer = window.setTimeout(() => { if (mounted) setVisible(true); }, 2400);
        return () => { mounted = false; window.clearTimeout(timer); };
      }
    } catch {
      const timer = window.setTimeout(() => { if (mounted) setVisible(true); }, 2400);
      return () => { mounted = false; window.clearTimeout(timer); };
    }
    return () => { mounted = false; };
  }, [publicKey]);

  function dismiss() {
    setVisible(false);
    try { window.localStorage.setItem(DISMISSED_KEY, '1'); } catch { /* optional preference */ }
  }

  async function enable() {
    if (busy) return;
    if (!publicKey) {
      setMessage('إعدادات التنبيهات غير مكتملة على الموقع.');
      return;
    }
    setBusy(true);
    setMessage('');
    try {
      const permission = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission();
      if (permission !== 'granted') throw new Error('لم يتم منح إذن الإشعارات.');
      const registration = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
      const ready = await navigator.serviceWorker.ready;
      const existing = await ready.pushManager.getSubscription();
      const subscription = existing || await registration.pushManager.subscribe({
        userVisibleOnly: true, applicationServerKey: decodeKey(publicKey),
      });
      const response = await fetch('/api/push/subscribe', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subscription: subscription.toJSON(),
          preference: { mode: 'all', subjectIds: [] },
        }),
      });
      const result: unknown = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(errorMessage(result));
      setHasSubscription(true);
      setMessage('تم تفعيل الإشعارات على الجهاز ده بنجاح.');
      window.localStorage.setItem(DISMISSED_KEY, '1');
      window.setTimeout(() => setVisible(false), 2300);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'حصلت مشكلة أثناء تفعيل الإشعارات.');
    } finally {
      setBusy(false);
    }
  }

  if (!visible || hasSubscription || iosNeedsHome) return null;

  return (
    <aside className="push-optin-card" aria-label="تفعيل إشعارات الموقع">
      <div className="push-optin-icon" aria-hidden="true">
        <svg viewBox="0 0 24 24" width="22" height="22" fill="none">
          <path d="M18 9a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9Z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round"/>
          <path d="M9.5 21h5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/>
        </svg>
      </div>
      <div className="push-optin-copy">
        <strong>فعّل إشعارات الموقع</strong>
        <p>{message || 'خليك متابع مواعيد الامتحانات وأي إعلان جديد من الإدارة.'}</p>
        <div className="push-optin-actions">
          <button type="button" onClick={enable} disabled={busy}>{busy ? 'جارٍ التفعيل…' : 'تفعيل الإشعارات'}</button>
          <button type="button" className="push-optin-dismiss" onClick={dismiss} aria-label="إغلاق">لاحقًا</button>
        </div>
      </div>
      <button type="button" className="push-optin-close" onClick={dismiss} aria-label="إغلاق التنبيه">×</button>
    </aside>
  );
}
