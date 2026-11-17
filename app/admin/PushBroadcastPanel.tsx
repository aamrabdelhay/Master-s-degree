'use client';

import { useState } from 'react';

export default function PushBroadcastPanel() {
  const [title, setTitle] = useState('دبلومة القانون الخاص');
  const [message, setMessage] = useState('');
  const [url, setUrl] = useState('/');
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');

  async function send() {
    if (busy || !title.trim() || !message.trim()) return;
    if (!window.confirm('إرسال الإشعار إلى كل الأجهزة التي فعّلت إشعارات الموقع؟')) return;
    setBusy(true);
    setStatus('');
    try {
      const response = await fetch('/api/push/broadcast', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, message, url }),
      });
      const data = await response.json().catch(() => ({})) as {
        error?: string; sent?: number; failed?: number; total?: number;
      };
      if (!response.ok) throw new Error(data.error || 'تعذّر إرسال الإشعار.');
      setStatus('تم الإرسال إلى ' + (data.sent || 0) + ' جهاز من أصل ' + (data.total || 0) +
        (data.failed ? '، وفشل إرسال ' + data.failed + ' جهاز.' : ' جهاز بنجاح.'));
      setMessage('');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'حصل خطأ أثناء الإرسال.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel push-broadcast-panel">
      <h2 className="panel-title"><span className="dot" />إرسال إشعار للطلاب</h2>
      <p className="push-broadcast-help">الإشعار هيوصل لكل جهاز وافق على تفعيل إشعارات الموقع، حتى لو الموقع مقفول.</p>
      <div className="field">
        <label htmlFor="push-broadcast-title">عنوان الإشعار</label>
        <input id="push-broadcast-title" type="text" maxLength={80} value={title}
          onChange={(event) => setTitle(event.currentTarget.value)} />
      </div>
      <div className="field">
        <label htmlFor="push-broadcast-message">نص الإشعار</label>
        <textarea id="push-broadcast-message" rows={3} maxLength={220} value={message}
          placeholder="اكتب الإعلان أو التنبيه اللي هيظهر للطلاب…"
          onChange={(event) => setMessage(event.currentTarget.value)} />
        <span className="hint">{message.length} / ٢٢٠ حرف</span>
      </div>
      <div className="field">
        <label htmlFor="push-broadcast-url">الصفحة اللي تفتح عند الضغط (اختياري)</label>
        <input id="push-broadcast-url" type="text" dir="ltr" value={url}
          placeholder="/"
          onChange={(event) => setUrl(event.currentTarget.value || '/')} />
      </div>
      <div className="inline-actions">
        <button type="button" className="btn btn-primary" onClick={send}
          disabled={busy || !title.trim() || !message.trim()}>
          {busy ? 'جاري الإرسال…' : 'إرسال الإشعار الآن'}
        </button>
      </div>
      {status && <p className="push-broadcast-status" role="status">{status}</p>}
    </section>
  );
}
