'use client';

import { useEffect, useState } from 'react';
import type { PublicSubject } from '@/lib/types';

type PreferenceMode = 'all' | 'selected';
type NavigatorWithStandalone = Navigator & { standalone?: boolean };

function decodeApplicationServerKey(value: string): ArrayBuffer {
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64 + '='.repeat((4 - base64.length % 4) % 4);
  const binary = window.atob(padded);
  const buffer = new ArrayBuffer(binary.length);
  const key = new Uint8Array(buffer);
  for (let index = 0; index < binary.length; index += 1) key[index] = binary.charCodeAt(index);
  return buffer;
}
function apiError(value: unknown, fallback: string): string {
  if (typeof value === 'object' && value !== null &&
      typeof (value as Record<string, unknown>).error === 'string') {
    return (value as { error: string }).error;
  }
  return fallback;
}
export default function PushNotifications({ subjects }: { subjects: PublicSubject[] }) {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || '';
  const [supportChecked, setSupportChecked] = useState(false);
  const [supported, setSupported] = useState(false);
  const [iosNeedsHomeScreen, setIosNeedsHomeScreen] = useState(false);
  const [subscription, setSubscription] = useState<PushSubscription | null>(null);
  const [mode, setMode] = useState<PreferenceMode>('all');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    setSelectedIds(subjects.map((subject) => subject.id));
    const ios = /iphone|ipad|ipod/i.test(navigator.userAgent) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    const nav = navigator as NavigatorWithStandalone;
    const standalone = nav.standalone === true || window.matchMedia('(display-mode: standalone)').matches;
    if (ios && !standalone) {
      setIosNeedsHomeScreen(true);
      setSupported(true);
      setSupportChecked(true);
      return;
    }
    const canPush = window.isSecureContext &&
      'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
    setSupported(canPush);
    setSupportChecked(true);
    if (canPush) {
      void navigator.serviceWorker.register('/sw.js', { scope: '/' }).then(async (registration) => {
        const existing = await registration.pushManager.getSubscription();
        if (existing) setSubscription(existing);
      }).catch(() => undefined);
    }
  }, [subjects]);

  async function saveSubscription() {
    if (busy) return;
    setBusy(true);
    setMessage('');
    try {
      const permission = Notification.permission === 'granted'
        ? 'granted' : await Notification.requestPermission();
      if (permission !== 'granted') {
        setMessage(permission === 'denied'
          ? 'إذن التنبيهات مرفوض من إعدادات المتصفح. فعّله من إعدادات الموقع أولًا.'
          : 'محتاج تسمح بالتنبيهات عشان توصلك مواعيد الامتحانات.');
        return;
      }
      const registration = await navigator.serviceWorker.ready;
      const existing = await registration.pushManager.getSubscription();
      const current = existing || await registration.pushManager.subscribe({
        userVisibleOnly: true, applicationServerKey: decodeApplicationServerKey(publicKey),
      });
      const response = await fetch('/api/push/subscribe', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subscription: current.toJSON(),
          preference: { mode, subjectIds: mode === 'selected' ? selectedIds : [] },
        }),
      });
      const result: unknown = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(apiError(result, 'مش قادرين نحفظ إعدادات التنبيه.'));
      setSubscription(current);
      setMessage('التنبيهات اتفعلت واتحفظ اختيار المواد بنجاح.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'حصلت مشكلة أثناء تفعيل التنبيهات.');
    } finally { setBusy(false); }
  }

  async function disableSubscription() {
    if (!subscription || busy) return;
    setBusy(true);
    setMessage('');
    try {
      const response = await fetch('/api/push/unsubscribe', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ endpoint: subscription.endpoint }),
      });
      const result: unknown = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(apiError(result, 'مش قادرين نلغي الاشتراك دلوقتي.'));
      await subscription.unsubscribe();
      setSubscription(null);
      setMessage('تم إيقاف تنبيهات الامتحانات على الجهاز ده.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'حصلت مشكلة أثناء إيقاف التنبيهات.');
    } finally { setBusy(false); }
  }

  function toggleSubject(subjectId: string, checked: boolean) {
    setSelectedIds((current) => checked
      ? [...new Set([...current, subjectId])]
      : current.filter((id) => id !== subjectId));
  }

  return (
    <section className="push-panel" aria-labelledby="push-panel-title">
      <div className="study-plan-heading"><div>
        <h2 id="push-panel-title">تنبيهات مواعيد الامتحانات</h2>
        <p>تنبيه قبل الامتحان بـ٢٤ ساعة، وتنبيه تاني قبلها بساعة.</p>
      </div></div>
      {!supportChecked ? <p className="push-status">بنتأكد من دعم المتصفح…</p>
        : !supported ? <p className="push-status">المتصفح ده مش بيدعم تنبيهات الويب أو الموقع مش مفتوح على اتصال آمن.</p>
        : iosNeedsHomeScreen ? <div className="push-ios-help">
          على iPhone أو iPad، افتح الموقع في Safari واضغط «مشاركة» ثم «إضافة إلى الشاشة الرئيسية».
          افتح الموقع من الأيقونة الجديدة، وبعدها تقدر تفعّل التنبيهات. دعم Web Push على iOS يبدأ من 16.4.
        </div>
        : !publicKey ? <p className="push-status">التنبيهات مش متاحة حاليًا؛ إعدادات VAPID لسه ما اتضافتش للموقع.</p>
        : <>
          <div className="push-preferences">
            <label><input type="radio" name="push-mode" checked={mode === 'all'} onChange={() => setMode('all')} /><span>كل المواد</span></label>
            <label><input type="radio" name="push-mode" checked={mode === 'selected'} onChange={() => setMode('selected')} /><span>مواد محددة</span></label>
          </div>
          {mode === 'selected' && <div className="push-subject-options">
            {subjects.map((subject) => <label key={subject.id}>
              <input type="checkbox" checked={selectedIds.includes(subject.id)}
                onChange={(event) => toggleSubject(subject.id, event.currentTarget.checked)} />
              <span>{subject.name}</span>
            </label>)}
          </div>}
          <div className="push-actions">
            <button type="button" disabled={busy || (mode === 'selected' && selectedIds.length === 0)} onClick={saveSubscription}>
              {busy ? 'جارٍ الحفظ…' : subscription ? 'حفظ إعدادات التنبيهات' : 'فعّل التنبيهات'}
            </button>
            {subscription && <button type="button" className="push-disable-button" disabled={busy}
              onClick={disableSubscription}>إيقاف التنبيهات</button>}
          </div>
          {message && <p className="push-status" role="status">{message}</p>}
          {subscription && <p className="push-status">فيه اشتراك تنبيهات متسجل على الجهاز ده.</p>}
        </>}
    </section>
  );
}
