'use client';

import { useEffect, useState } from 'react';

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
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [hasSubscription, setHasSubscription] = useState(false);

  useEffect(() => {
    let mounted = true;
    let timer: number | undefined;
    const reveal = (delay = 2400) => {
      if (timer !== undefined) window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        if (mounted) setVisible(true);
      }, delay);
    };

    // Detect iOS before checking PushManager: Safari on iPhone/iPad does not
    // expose web-push until the site is installed as a Home Screen web app.
    const ios = /iphone|ipad|ipod/i.test(navigator.userAgent) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    const nav = navigator as NavigatorWithStandalone;
    const standalone = nav.standalone === true || window.matchMedia('(display-mode: standalone)').matches;

    if (ios && !standalone) {
      setIosNeedsHome(true);
      setMessage('على iPhone وiPad، أضف الموقع إلى الشاشة الرئيسية وافتحه من الأيقونة أولًا لتفعيل الإشعارات.');
      reveal();
    } else {
      const canPush = window.isSecureContext &&
        'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

      if (canPush) {
        if (Notification.permission === 'denied') {
          setPermissionDenied(true);
          setMessage('إشعارات الموقع محظورة من المتصفح. اسمح بها من إعدادات الموقع في المتصفح ثم افتح الموقع مرة أخرى.');
          reveal();
        } else if (Notification.permission !== 'granted') {
          if (!publicKey) setMessage('إعدادات الإشعارات غير مكتملة على الموقع حاليًا.');
          reveal();
        } else {
          void (async () => {
            try {
              await navigator.serviceWorker.register('/sw.js', { scope: '/' });
              const registration = await navigator.serviceWorker.ready;
              const subscription = await registration.pushManager.getSubscription();
              if (!mounted) return;
              if (!subscription) {
                setMessage('إذن الإشعارات موجود، لكن الاشتراك على الجهاز لم يكتمل بعد.');
                reveal(1200);
                return;
              }

              const response = await fetch('/api/push/subscribe', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  subscription: subscription.toJSON(),
                  preference: { mode: 'all', subjectIds: [] },
                }),
              });
              if (!response.ok) throw new Error('تعذّر تأكيد اشتراك الإشعارات على الموقع.');
              if (!mounted) return;
              setHasSubscription(true);
            } catch {
              if (!mounted) return;
              setMessage('إذن الإشعارات موجود، لكن تعذّر تأكيد الاشتراك. أعد تفعيله من هنا.');
              reveal(1200);
            }
          })();
        }
      }
    }

    return () => {
      mounted = false;
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [publicKey]);

  function dismiss() {
    // Dismiss only for this page visit. The prompt returns on the next visit
    // until browser permission and the server-side push subscription are active.
    setVisible(false);
  }

  async function enable() {
    if (busy) return;
    if (!publicKey) {
      setMessage('إعدادات التنبيهات غير مكتملة على الموقع.');
      return;
    }
    if (Notification.permission === 'denied') {
      setPermissionDenied(true);
      setMessage('الإشعارات محظورة من المتصفح. افتح إعدادات الموقع واسمح بالإشعارات، ثم أعد تحميل الصفحة.');
      return;
    }

    setBusy(true);
    setMessage('');
    try {
      const permission = Notification.permission === 'granted'
        ? 'granted' : await Notification.requestPermission();
      if (permission !== 'granted') {
        if (permission === 'denied') {
          setPermissionDenied(true);
          setMessage('تم حظر الإشعارات من المتصفح. اسمح بها من إعدادات الموقع ثم أعد تحميل الصفحة.');
          return;
        }
        setMessage('لم يتم منح إذن الإشعارات. يمكنك تفعيلها من الزر مرة أخرى.');
        return;
      }

      const registration = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
      const ready = await navigator.serviceWorker.ready;
      const existing = await ready.pushManager.getSubscription();
      const subscription = existing || await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: decodeKey(publicKey),
      });
      const response = await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subscription: subscription.toJSON(),
          preference: { mode: 'all', subjectIds: [] },
        }),
      });
      const result: unknown = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(errorMessage(result));

      setHasSubscription(true);
      setMessage('تم تفعيل الإشعارات على الجهاز ده بنجاح.');
      setVisible(false);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'حصلت مشكلة أثناء تفعيل الإشعارات.');
    } finally {
      setBusy(false);
    }
  }

  if (!visible || hasSubscription) return null;

  const canActivate = Boolean(publicKey) && !permissionDenied && !iosNeedsHome;

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
          {canActivate && (
            <button type="button" onClick={enable} disabled={busy}>
              {busy ? 'جارٍ التفعيل…' : 'تفعيل الإشعارات'}
            </button>
          )}
          <button type="button" className="push-optin-dismiss" onClick={dismiss} aria-label="إغلاق">لاحقًا</button>
        </div>
      </div>
      <button type="button" className="push-optin-close" onClick={dismiss} aria-label="إغلاق التنبيه">×</button>
    </aside>
  );
}
