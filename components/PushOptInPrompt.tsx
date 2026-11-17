'use client';

import { useEffect, useState } from 'react';
import {
  canUseWebPush, getOrCreateSubscription, isInAppBrowser, registerPushWorker,
} from '@/lib/pushClient';

type NavigatorWithStandalone = Navigator & { standalone?: boolean };
type Mode = 'idle' | 'ask' | 'denied' | 'ios' | 'unsupported' | 'retry';

function errorMessage(value: unknown): string {
  if (typeof value === 'object' && value !== null &&
      typeof (value as Record<string, unknown>).error === 'string') {
    return (value as { error: string }).error;
  }
  return 'مش قادرين نفعل التنبيهات دلوقتي.';
}

async function saveSubscription(subscription: PushSubscription, keepPreference: boolean) {
  const response = await fetch('/api/push/subscribe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      subscription: subscription.toJSON(),
      preference: { mode: keepPreference ? 'keep' : 'all', subjectIds: [] },
    }),
  });
  const result: unknown = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(errorMessage(result));
}

export default function PushOptInPrompt() {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || '';
  const [mode, setMode] = useState<Mode>('idle');
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [done, setDone] = useState(false);

  useEffect(() => {
    let mounted = true;
    let timer: number | undefined;
    const show = (next: Mode, text = '', delay = 1500) => {
      setMode(next);
      setMessage(text);
      timer = window.setTimeout(() => { if (mounted) setVisible(true); }, delay);
    };

    const ios = /iphone|ipad|ipod/i.test(navigator.userAgent) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    const standalone = (navigator as NavigatorWithStandalone).standalone === true ||
      window.matchMedia('(display-mode: standalone)').matches;

    if (ios && !standalone) {
      show('ios', 'على iPhone وiPad: اضغط زر المشاركة ثم "إضافة إلى الشاشة الرئيسية"، وافتح الموقع من الأيقونة لتفعيل الإشعارات.');
    } else if (isInAppBrowser() || !canUseWebPush()) {
      show('unsupported', 'المتصفح اللي فاتح منه الموقع (زي متصفح تيليجرام أو فيسبوك) مش بيدعم الإشعارات. افتح الرابط من Chrome أو Safari.');
    } else if (!publicKey) {
      // Nothing to subscribe with; stay silent for students.
    } else if (Notification.permission === 'denied') {
      show('denied', 'الإشعارات محظورة من المتصفح. اسمح بها من إعدادات الموقع (أيقونة القفل جنب الرابط) ثم أعد تحميل الصفحة.');
    } else if (Notification.permission === 'default') {
      show('ask', 'خليك متابع مواعيد الامتحانات وأي إعلان جديد من الإدارة.');
    } else {
      // Permission already granted: make sure this device is subscribed with the
      // current key and known to the server, silently and without touching preferences.
      void (async () => {
        try {
          const registration = await registerPushWorker();
          const subscription = await getOrCreateSubscription(registration, publicKey);
          await saveSubscription(subscription, true);
          if (mounted) setDone(true);
        } catch {
          if (mounted) show('retry', 'إذن الإشعارات موجود، لكن تعذّر تأكيد الاشتراك. اضغط لإعادة التفعيل.', 800);
        }
      })();
    }

    return () => {
      mounted = false;
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [publicKey]);

  async function enable() {
    if (busy || !publicKey) return;
    setBusy(true);
    setMessage('');
    try {
      // Must run straight from the click so the browser shows its permission dialog.
      const permission = Notification.permission === 'granted'
        ? 'granted' : await Notification.requestPermission();
      if (permission === 'denied') {
        setMode('denied');
        setMessage('تم حظر الإشعارات. اسمح بها من إعدادات الموقع ثم أعد تحميل الصفحة.');
        return;
      }
      if (permission !== 'granted') {
        setMessage('لم يتم منح الإذن. تقدر تفعّلها من الزر مرة أخرى.');
        return;
      }
      const registration = await registerPushWorker();
      const subscription = await getOrCreateSubscription(registration, publicKey);
      await saveSubscription(subscription, mode === 'retry');
      setDone(true);
      setVisible(false);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'حصلت مشكلة أثناء تفعيل الإشعارات.');
    } finally {
      setBusy(false);
    }
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setMessage('تم نسخ الرابط. الصقه في Chrome أو Safari.');
    } catch {
      setMessage('انسخ الرابط من شريط العنوان وافتحه في Chrome أو Safari.');
    }
  }

  if (!visible || done || mode === 'idle') return null;

  return (
    <aside className="push-optin-card" aria-label="تفعيل إشعارات الموقع">
      <div className="push-optin-icon" aria-hidden="true">
        <svg viewBox="0 0 24 24" width="22" height="22" fill="none">
          <path d="M18 9a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9Z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round"/>
          <path d="M9.5 21h5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/>
        </svg>
      </div>
      <div className="push-optin-copy">
        <strong>{mode === 'ask' || mode === 'retry' ? 'فعّل إشعارات الموقع' : 'الإشعارات مش متاحة هنا'}</strong>
        <p>{message}</p>
        <div className="push-optin-actions">
          {(mode === 'ask' || mode === 'retry') && (
            <button type="button" onClick={enable} disabled={busy}>
              {busy ? 'جارٍ التفعيل…' : 'تفعيل الإشعارات'}
            </button>
          )}
          {mode === 'unsupported' && <button type="button" onClick={copyLink}>نسخ الرابط</button>}
          <button type="button" className="push-optin-dismiss" onClick={() => setVisible(false)}>لاحقًا</button>
        </div>
      </div>
      <button type="button" className="push-optin-close" onClick={() => setVisible(false)} aria-label="إغلاق التنبيه">×</button>
    </aside>
  );
}
