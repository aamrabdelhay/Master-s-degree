'use client';

import { useEffect, useRef, useState } from 'react';
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
  const reshowTimer = useRef<number | undefined>(undefined);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      if (reshowTimer.current !== undefined) window.clearTimeout(reshowTimer.current);
    };
  }, []);

  useEffect(() => {
    let active = true;
    const show = (next: Mode, text = '') => {
      setMode(next);
      setMessage(text);
      setVisible(true);
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
      // Stay silent when push delivery is not configured.
    } else if (Notification.permission === 'denied') {
      show('denied', 'الإشعارات محظورة من المتصفح. اسمح بها من إعدادات الموقع (أيقونة القفل جنب الرابط) ثم أعد تحميل الصفحة.');
    } else if (Notification.permission === 'default') {
      show('ask', 'اسمح بإشعارات الموقع علشان يوصلك أي إعلان أو تحديث جديد ومواعيد مهمة أول ما تنزل.');
    } else {
      void (async () => {
        try {
          const registration = await registerPushWorker();
          const subscription = await getOrCreateSubscription(registration, publicKey);
          await saveSubscription(subscription, true);
          if (active) setDone(true);
        } catch {
          if (active) show('retry', 'إذن الإشعارات موجود، لكن تعذّر تأكيد اشتراك الجهاز. اضغط لإعادة التفعيل.');
        }
      })();
    }

    return () => { active = false; };
  }, [publicKey]);

  function dismiss() {
    setVisible(false);
    if (reshowTimer.current !== undefined) window.clearTimeout(reshowTimer.current);
    const delay = mode === 'ask' || mode === 'retry' ? 45_000 : 120_000;
    reshowTimer.current = window.setTimeout(() => {
      if (mounted.current) setVisible(true);
    }, delay);
  }

  async function enable() {
    if (busy || !publicKey) return;
    setBusy(true);
    setMessage('');
    try {
      // Browsers require a direct user gesture before showing the native permission dialog.
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
      // Permission was granted: dismiss the opt-in card immediately.
      // Subscription persistence runs afterwards and can be retried on a later visit.
      setDone(true);
      setVisible(false);
      const registration = await registerPushWorker();
      const subscription = await getOrCreateSubscription(registration, publicKey);
      await saveSubscription(subscription, mode === 'retry');
    } catch (error) {
      if (Notification.permission !== 'granted') {
        setMessage(error instanceof Error ? error.message : 'حصلت مشكلة أثناء تفعيل الإشعارات.');
      } else {
        // Do not keep the permission prompt visible after browser permission succeeds.
        setDone(true);
        setVisible(false);
      }
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
          <button type="button" className="push-optin-dismiss" onClick={dismiss}>لاحقًا</button>
        </div>
      </div>
      <button type="button" className="push-optin-close" onClick={dismiss} aria-label="إغلاق التنبيه">×</button>
    </aside>
  );
}
