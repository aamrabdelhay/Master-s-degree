'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function AdminSetup({ kvReady }: { kvReady: boolean }) {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);

    if (password.length < 8) {
      setError('كلمة المرور لازم تكون 8 حروف على الأقل.');
      return;
    }
    if (password !== confirm) {
      setError('كلمة المرور والتأكيد مش متطابقين.');
      return;
    }

    setLoading(true);
    try {
      const response = await fetch('/api/auth/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password, confirm }),
      });
      const data = (await response.json().catch(() => ({}))) as { error?: string };

      if (!response.ok) {
        setError(data.error || 'حصل خطأ، جرّب تاني.');
        setLoading(false);
        return;
      }

      router.refresh();
    } catch {
      setError('تعذّر الاتصال بالسيرفر، جرّب تاني.');
      setLoading(false);
    }
  }

  return (
    <div className="admin-shell">
      <div className="auth-wrap">
        <form className="auth-card" onSubmit={handleSubmit} dir="rtl">
          <div className="auth-icon" aria-hidden="true">
            ⚖
          </div>
          <h1 className="auth-title">اختر كلمة المرور</h1>
          <p className="auth-sub">
            أول دخول — اعمل كلمة مرور الأدمن. هتتخزن مشفّرة، ومش هينفع تعمل واحدة تانية بعد
            كده (تقدر تغيّرها من الداخل).
          </p>

          {!kvReady && (
            <div className="admin-note error">
              <strong>تنبيه: قاعدة البيانات المشتركة غير مربوطة.</strong>
              البيانات دلوقتي بتتحفظ مؤقتاً في الذاكرة. اربط Upstash / Vercel KV بمتغيرات
              البيئة عشان التعديلات تفضل محفوظة وتظهر لكل الزوار.
            </div>
          )}

          {error && <div className="auth-error">{error}</div>}

          <div className="field">
            <label htmlFor="setup-password">كلمة المرور</label>
            <input
              id="setup-password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="8 حروف على الأقل"
              autoComplete="new-password"
              autoFocus
              required
            />
          </div>

          <div className="field">
            <label htmlFor="setup-confirm">تأكيد كلمة المرور</label>
            <input
              id="setup-confirm"
              type="password"
              value={confirm}
              onChange={(event) => setConfirm(event.target.value)}
              placeholder="اكتبها تاني"
              autoComplete="new-password"
              required
            />
          </div>

          <button className="btn btn-primary btn-block" type="submit" disabled={loading}>
            {loading ? 'جاري الحفظ…' : 'حفظ كلمة المرور والدخول'}
          </button>

          <p className="auth-footer">هتتسجّل كلمة المرور مرة واحدة بس ومش هينفع تتغير إلا من الداخل.</p>
        </form>
      </div>
    </div>
  );
}
