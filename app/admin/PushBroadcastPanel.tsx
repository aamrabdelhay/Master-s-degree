'use client';

import { useState } from 'react';

type NotificationMode = 'update' | 'custom';

const UPDATE_NOTIFICATION = {
  title: 'تم تحديث الموقع',
  message: 'تم تحديث الموقع. افتح الموقع لمشاهدة آخر التعديلات.',
};

export default function PushBroadcastPanel() {
  const [mode, setMode] = useState<NotificationMode>('update');
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [url, setUrl] = useState('/');
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');

  async function send() {
    if (busy) return;
    if (mode === 'custom' && (!title.trim() || !message.trim())) return;

    const notification = mode === 'update'
      ? UPDATE_NOTIFICATION
      : { title: title.trim(), message: message.trim() };

    const kindLabel = mode === 'update' ? 'إشعار تحديث الموقع' : 'الإشعار المخصص';
    if (!window.confirm('إرسال ' + kindLabel + ' إلى كل الأجهزة التي فعّلت إشعارات الموقع؟')) return;

    setBusy(true);
    setStatus('');
    try {
      const response = await fetch('/api/push/broadcast', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...notification, url }),
      });
      const data = await response.json().catch(() => ({})) as {
        error?: string; sent?: number; failed?: number; total?: number;
      };
      if (!response.ok) throw new Error(data.error || 'تعذّر إرسال الإشعار.');
      setStatus(
        'تم إرسال ' + kindLabel + ' إلى ' + (data.sent || 0) + ' جهاز من أصل ' +
        (data.total || 0) + (data.failed ? '، وفشل إرسال ' + data.failed + ' جهاز.' : ' جهاز بنجاح.'),
      );
      if (mode === 'custom') {
        setTitle('');
        setMessage('');
      }
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'حصل خطأ أثناء الإرسال.');
    } finally {
      setBusy(false);
    }
  }

  const canSend = mode === 'update' || Boolean(title.trim() && message.trim());

  return (
    <section className="panel push-broadcast-panel">
      <h2 className="panel-title"><span className="dot" />إرسال إشعار للطلاب</h2>
      <p className="push-broadcast-help">
        اختار نوع الإشعار. الإرسال يدوي من هنا، وهيصل للأجهزة اللي وافقت على تفعيل الإشعارات.
      </p>

      <div className="push-mode-switch" role="group" aria-label="نوع الإشعار">
        <button type="button" className={mode === 'update' ? 'is-active' : ''}
          aria-pressed={mode === 'update'} onClick={() => { setMode('update'); setStatus(''); }}>
          تحديث الموقع
        </button>
        <button type="button" className={mode === 'custom' ? 'is-active' : ''}
          aria-pressed={mode === 'custom'} onClick={() => { setMode('custom'); setStatus(''); }}>
          إشعار مخصص
        </button>
      </div>

      {mode === 'update' ? (
        <div className="push-update-preview">
          <strong>{UPDATE_NOTIFICATION.title}</strong>
          <p>{UPDATE_NOTIFICATION.message}</p>
          <small>اضغط إرسال لما تنشر تحديثًا جديدًا وتحب تنبّه الطلاب بنفسك.</small>
        </div>
      ) : (
        <>
          <div className="field">
            <label htmlFor="push-broadcast-title">عنوان الإشعار</label>
            <input id="push-broadcast-title" type="text" maxLength={80} value={title}
              onChange={(event) => setTitle(event.currentTarget.value)}
              placeholder="مثال: تعديل موعد امتحان المدني" />
          </div>
          <div className="field">
            <label htmlFor="push-broadcast-message">نص الإشعار</label>
            <textarea id="push-broadcast-message" rows={3} maxLength={220} value={message}
              onChange={(event) => setMessage(event.currentTarget.value)}
              placeholder="اكتب التفاصيل اللي عايز توصل للطلاب…" />
            <span className="hint">{message.length} / ٢٢٠ حرف</span>
          </div>
        </>
      )}

      <div className="field">
        <label htmlFor="push-broadcast-url">الصفحة اللي تفتح عند الضغط (اختياري)</label>
        <input id="push-broadcast-url" type="text" dir="ltr" value={url}
          placeholder="/" onChange={(event) => setUrl(event.currentTarget.value || '/')} />
      </div>

      <div className="inline-actions">
        <button type="button" className="btn btn-primary" onClick={send}
          disabled={busy || !canSend}>
          {busy ? 'جاري الإرسال…' : mode === 'update' ? 'إرسال إشعار تحديث الموقع' : 'إرسال الإشعار المخصص'}
        </button>
      </div>
      {status && <p className="push-broadcast-status" role="status">{status}</p>}
    </section>
  );
}
