'use client';

import { useEffect, useState } from 'react';

type Bucket = { hour: number; label: string; visits: number };
type Snapshot = { activeNow: number; totalVisits: number; last24Hours: number; buckets: Bucket[]; updatedAt: string };

export default function AnalyticsPanel() {
  const [data, setData] = useState<Snapshot | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      try {
        const response = await fetch('/api/analytics/admin', { cache: 'no-store' });
        const result = await response.json().catch(() => ({})) as Snapshot & { error?: string };
        if (!response.ok) throw new Error(result.error || 'تعذّر تحميل إحصائيات الموقع.');
        if (mounted) { setData(result); setError(''); }
      } catch (err) {
        if (mounted) setError(err instanceof Error ? err.message : 'تعذّر تحميل الإحصائيات.');
      } finally { if (mounted) setLoading(false); }
    };
    void load();
    const interval = window.setInterval(() => { void load(); }, 30_000);
    return () => { mounted = false; window.clearInterval(interval); };
  }, []);

  const maxVisits = data ? Math.max(1, ...data.buckets.map((bucket) => bucket.visits)) : 1;

  return (
    <section className="panel analytics-panel">
      <h2 className="panel-title"><span className="dot" />إحصائيات الموقع</h2>
      <div className="analytics-stat-grid">
        <article className="analytics-stat"><span>الموجودون الآن</span><strong>{data ? data.activeNow.toLocaleString('ar-EG') : '—'}</strong><small>نشط خلال آخر دقيقتين</small></article>
        <article className="analytics-stat"><span>إجمالي الزيارات</span><strong>{data ? data.totalVisits.toLocaleString('ar-EG') : '—'}</strong><small>من بداية تفعيل الإحصائيات</small></article>
        <article className="analytics-stat"><span>آخر ٢٤ ساعة</span><strong>{data ? data.last24Hours.toLocaleString('ar-EG') : '—'}</strong><small>موزعة بالساعة</small></article>
      </div>
      <div className="analytics-chart-heading">
        <strong>حركة الزيارات خلال آخر ٢٤ ساعة</strong>
        {data && <small>آخر تحديث {new Intl.DateTimeFormat('ar-EG', { timeZone: 'Africa/Cairo', hour: '2-digit', minute: '2-digit' }).format(new Date(data.updatedAt))}</small>}
      </div>
      {loading && !data ? <p className="analytics-message">جاري تحميل الإحصائيات…</p>
        : error && !data ? <p className="analytics-message is-error">{error}</p>
          : <div className="analytics-chart" role="img" aria-label="رسم بياني للزيارات في آخر ٢٤ ساعة">
            {data?.buckets.map((bucket) => (
              <div className="analytics-chart-col" key={bucket.hour} title={bucket.label + ': ' + bucket.visits + ' زيارة'}>
                <span className="analytics-chart-value">{bucket.visits || ''}</span>
                <div className="analytics-chart-track"><span style={{ height: Math.max(bucket.visits ? 5 : 0, bucket.visits / maxVisits * 100) + '%' }} /></div>
                <small>{bucket.label}</small>
              </div>
            ))}
          </div>}
      {error && data && <p className="analytics-message is-error">{error}</p>}
      <p className="analytics-note">العداد بيُحدّث تلقائيًا كل ٣٠ ثانية. الزيارة بتتحسب مرة واحدة لكل جلسة متصفح، والعدد الحالي يعتمد على نبضات النشاط.</p>
    </section>
  );
}
