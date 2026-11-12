'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function AdminLogin({ kvReady }: { kvReady: boolean }) {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      const data = (await response.json().catch(() => ({}))) as { error?: string };

      if (!response.ok) {
        setError(data.error || 'كلمة المرور غلط.');
        setPassword('');
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
            🔒
          </div>
          <h1 className="auth-title">لوحة التحكم</h1>
          <p className="auth-sub">اكتب كلمة المرور للدخول وتعديل الجدول.</p>

          {!kvReady && (
            <div className="admin-note error">
              <strong>تنبيه: قاعدة البيانات المشتركة غير مربوطة.</strong>
              اربط Upstash / Vercel KV بمتغيرات البيئة عشان التعديلات تفضل محفوظة.
            </div>
          )}

          {error && <div className="auth-error">{error}</div>}

          <div className="field">
            <label htmlFor="login-password">كلمة المرور</label>
            <input
              id="login-password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="••••••••"
              autoComplete="current-password"
              autoFocus
              required
            />
          </div>

          <button className="btn btn-primary btn-block" type="submit" disabled={loading}>
            {loading ? 'جاري الدخول…' : 'دخول'}
          </button>

          <p className="auth-footer">5 محاولات غلط كتير؟ الدخول هيتقفل مؤقتاً 15 دقيقة.</p>
        </form>
      </div>
    </div>
  );
}
