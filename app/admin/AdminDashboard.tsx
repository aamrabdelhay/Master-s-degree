'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { formatCairoLabel } from '@/lib/cairo';
import { DEFAULT_BOOK_URL } from '@/lib/defaults';
import type { QuestionGroup, SiteData, Subject } from '@/lib/types';

function uid(prefix: string): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}-${crypto.randomUUID().slice(0, 8)}`;
  }
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

function newSubject(): Subject {
  return {
    id: uid('sub'),
    name: 'مادة جديدة',
    examAt: null,
    examFormat: '',
    curriculum: '',
    progress: '',
    cancelled: '',
    bookUrl: DEFAULT_BOOK_URL,
    groups: [],
  };
}

function newGroup(): QuestionGroup {
  return { id: uid('grp'), title: '', items: [] };
}

type Toast = { type: 'ok' | 'err'; message: string } | null;

export default function AdminDashboard({
  initialSite,
  kvReady,
}: {
  initialSite: SiteData;
  kvReady: boolean;
}) {
  const router = useRouter();
  const [site, setSite] = useState<SiteData>(initialSite);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<Toast>(null);
  const [showPassword, setShowPassword] = useState(false);
  const dirtyRef = useRef(false);

  useEffect(() => {
    dirtyRef.current = dirty;
  }, [dirty]);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 4500);
    return () => clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    const handler = (event: BeforeUnloadEvent) => {
      if (!dirtyRef.current) return;
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, []);

  function touch() {
    setDirty(true);
  }

  function updateSubject(id: string, updater: (subject: Subject) => Subject) {
    setSite((prev) => ({
      ...prev,
      subjects: prev.subjects.map((subject) => (subject.id === id ? updater(subject) : subject)),
    }));
    touch();
  }

  function updateGroup(subjectId: string, groupId: string, updater: (group: QuestionGroup) => QuestionGroup) {
    updateSubject(subjectId, (subject) => ({
      ...subject,
      groups: subject.groups.map((group) => (group.id === groupId ? updater(group) : group)),
    }));
  }

  function moveSubject(id: string, direction: -1 | 1) {
    setSite((prev) => {
      const index = prev.subjects.findIndex((subject) => subject.id === id);
      const target = index + direction;
      if (index < 0 || target < 0 || target >= prev.subjects.length) return prev;
      const subjects = [...prev.subjects];
      [subjects[index], subjects[target]] = [subjects[target], subjects[index]];
      return { ...prev, subjects };
    });
    touch();
  }

  function addSubject() {
    setSite((prev) => ({ ...prev, subjects: [...prev.subjects, newSubject()] }));
    touch();
  }

  function removeSubject(id: string, name: string) {
    if (!window.confirm(`متأكد إنك عايز تحذف مادة "${name || 'بدون اسم'}"؟`)) return;
    setSite((prev) => ({ ...prev, subjects: prev.subjects.filter((subject) => subject.id !== id) }));
    touch();
  }

  function addGroup(subjectId: string) {
    updateSubject(subjectId, (subject) => ({
      ...subject,
      groups: [...subject.groups, newGroup()],
    }));
  }

  function removeGroup(subjectId: string, groupId: string) {
    if (!window.confirm('تحذف مجموعة الأسئلة دي؟')) return;
    updateSubject(subjectId, (subject) => ({
      ...subject,
      groups: subject.groups.filter((group) => group.id !== groupId),
    }));
  }

  function moveGroup(subjectId: string, groupId: string, direction: -1 | 1) {
    updateSubject(subjectId, (subject) => {
      const index = subject.groups.findIndex((group) => group.id === groupId);
      const target = index + direction;
      if (index < 0 || target < 0 || target >= subject.groups.length) return subject;
      const groups = [...subject.groups];
      [groups[index], groups[target]] = [groups[target], groups[index]];
      return { ...subject, groups };
    });
  }

  function addItem(subjectId: string, groupId: string) {
    updateGroup(subjectId, groupId, (group) => ({
      ...group,
      items: [...group.items, { id: uid('q'), text: '' }],
    }));
  }

  function removeItem(subjectId: string, groupId: string, itemId: string) {
    updateGroup(subjectId, groupId, (group) => ({
      ...group,
      items: group.items.filter((item) => item.id !== itemId),
    }));
  }

  function moveItem(subjectId: string, groupId: string, itemId: string, direction: -1 | 1) {
    updateGroup(subjectId, groupId, (group) => {
      const index = group.items.findIndex((item) => item.id === itemId);
      const target = index + direction;
      if (index < 0 || target < 0 || target >= group.items.length) return group;
      const items = [...group.items];
      [items[index], items[target]] = [items[target], items[index]];
      return { ...group, items };
    });
  }

  async function handleSave() {
    setSaving(true);
    try {
      const response = await fetch('/api/site', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(site),
      });

      if (response.status === 401) {
        setToast({ type: 'err', message: 'الجلسة انتهت، سجّل الدخول تاني.' });
        router.refresh();
        return;
      }

      const data = (await response.json().catch(() => ({}))) as {
        site?: SiteData;
        error?: string;
      };

      if (!response.ok || !data.site) {
        setToast({ type: 'err', message: data.error || 'حصل خطأ أثناء الحفظ.' });
        return;
      }

      setSite(data.site);
      setDirty(false);
      setToast({ type: 'ok', message: 'تم حفظ التغييرات ✅ وظهرت للزوار فوراً' });
    } catch {
      setToast({ type: 'err', message: 'تعذّر الاتصال بالسيرفر، جرّب تاني.' });
    } finally {
      setSaving(false);
    }
  }

  async function handleReload() {
    if (dirtyRef.current && !window.confirm('فيه تغييرات مش متحفظة هتضيع. تحديث برضه؟')) return;
    try {
      const response = await fetch('/api/site', { cache: 'no-store' });
      const data = (await response.json().catch(() => null)) as SiteData | null;
      if (!response.ok || !data) {
        setToast({ type: 'err', message: 'تعذّر تحميل البيانات.' });
        return;
      }
      setSite(data);
      setDirty(false);
      setToast({ type: 'ok', message: 'تم تحميل أحدث نسخة من البيانات' });
    } catch {
      setToast({ type: 'err', message: 'تعذّر الاتصال بالسيرفر.' });
    }
  }

  async function handleLogout() {
    if (dirtyRef.current && !window.confirm('فيه تغييرات مش متحفظة. تسجّل خروج برضه؟')) return;
    await fetch('/api/auth/logout', { method: 'POST' });
    setDirty(false);
    router.refresh();
  }

  return (
    <div className="admin-shell">
      <div className="admin-topbar">
        <div className="admin-topbar-inner">
          <div className="admin-brand">
            لوحة التحكم — دبلومة القانون الخاص
            <small>جامعة العاصمة • جدول الامتحانات النهائية</small>
          </div>
          <div className="admin-topbar-actions">
            <a className="btn btn-ghost btn-sm" href="/" target="_blank" rel="noopener noreferrer">
              عرض الموقع ↗
            </a>
            <button className="btn btn-ghost btn-sm" type="button" onClick={handleLogout}>
              تسجيل الخروج
            </button>
          </div>
        </div>
      </div>

      {toast && <div className={`toast ${toast.type}`}>{toast.message}</div>}

      <div className="admin-wrap">
        {!kvReady && (
          <div className="admin-note error">
            <strong>تنبيه: قاعدة البيانات المشتركة غير مربوطة.</strong>
            التعديلات دلوقتي بتتحفظ في ذاكرة السيرفر وممكن تضيع. اربط Upstash / Vercel KV
            (KV_REST_API_URL و KV_REST_API_TOKEN) عشان كل الزوار يشوفوا نفس البيانات.
          </div>
        )}

        <div className="admin-note">
          <strong>ملاحظة عن الترتيب:</strong>
          المواد اللي ليها موعد بتظهر تلقائياً بالأقرب أولاً، والمواد اللي لسه ملهاش موعد
          بتظهر في آخر الصفحة بالترتيب اليدوي اللي تحت. كل الأوقات بتوقيت القاهرة
          (Africa/Cairo).
        </div>

        {/* ------- الإعدادات العامة ------- */}
        <section className="panel">
          <h2 className="panel-title">
            <span className="dot" />
            الهيدر
          </h2>
          <div className="grid-2">
            <div className="field">
              <label htmlFor="header-title">العنوان الرئيسي</label>
              <input
                id="header-title"
                type="text"
                value={site.headerTitle}
                onChange={(event) => {
                  const value = event.target.value;
                  setSite((prev) => ({ ...prev, headerTitle: value }));
                  touch();
                }}
              />
            </div>
            <div className="field">
              <label htmlFor="header-subtitle">العنوان الفرعي</label>
              <input
                id="header-subtitle"
                type="text"
                value={site.headerSubtitle}
                onChange={(event) => {
                  const value = event.target.value;
                  setSite((prev) => ({ ...prev, headerSubtitle: value }));
                  touch();
                }}
              />
            </div>
          </div>
        </section>

        {/* ------- المواد ------- */}
        <section className="panel">
          <h2 className="panel-title">
            <span className="dot" />
            المواد ({site.subjects.length})
          </h2>

          {site.subjects.length === 0 && <div className="empty-state">مفيش مواد. اضغط "إضافة مادة".</div>}

          {site.subjects.map((subject, index) => (
            <div className="subject-editor" key={subject.id}>
              <div className="se-head">
                <div className="se-index">{index + 1}</div>
                <div className="se-name">
                  <input
                    type="text"
                    value={subject.name}
                    placeholder="اسم المادة"
                    aria-label="اسم المادة"
                    onChange={(event) => {
                      const value = event.target.value;
                      updateSubject(subject.id, (current) => ({ ...current, name: value }));
                    }}
                  />
                </div>
                <div className="se-actions">
                  <button
                    type="button"
                    className="btn btn-ghost btn-icon"
                    title="تحريك لأعلى"
                    disabled={index === 0}
                    onClick={() => moveSubject(subject.id, -1)}
                  >
                    ▲
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost btn-icon"
                    title="تحريك لأسفل"
                    disabled={index === site.subjects.length - 1}
                    onClick={() => moveSubject(subject.id, 1)}
                  >
                    ▼
                  </button>
                  <button
                    type="button"
                    className="btn btn-danger btn-sm"
                    onClick={() => removeSubject(subject.id, subject.name)}
                  >
                    حذف
                  </button>
                </div>
              </div>

              <div className="grid-2">
                <div className="field">
                  <label>تاريخ ووقت الامتحان (توقيت القاهرة)</label>
                  <input
                    type="datetime-local"
                    value={subject.examAt ?? ''}
                    onChange={(event) => {
                      const value = event.target.value;
                      updateSubject(subject.id, (current) => ({
                        ...current,
                        examAt: value ? value : null,
                      }));
                    }}
                  />
                  <span className="hint">
                    {subject.examAt ? (
                      <span className="date-preview">
                        {formatCairoLabel(subject.examAt) ?? 'موعد غير صالح'}
                      </span>
                    ) : (
                      'سيبه فاضي والموقع هيكتب "الموعد لم يُحدد بعد".'
                    )}
                  </span>
                  {subject.examAt && (
                    <div className="inline-actions">
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        onClick={() =>
                          updateSubject(subject.id, (current) => ({ ...current, examAt: null }))
                        }
                      >
                        مسح الموعد
                      </button>
                    </div>
                  )}
                </div>

                <div className="field">
                  <label>لينك الكتاب</label>
                  <input
                    type="url"
                    dir="ltr"
                    value={subject.bookUrl}
                    placeholder="https://t.me/..."
                    onChange={(event) => {
                      const value = event.target.value;
                      updateSubject(subject.id, (current) => ({ ...current, bookUrl: value }));
                    }}
                  />
                  <span className="hint">لينك التليجرام اللي بيظهر في زرار "📖 الكتاب".</span>
                </div>
              </div>

              <div className="grid-2">
                <div className="field">
                  <label>شكل الامتحان</label>
                  <textarea
                    rows={2}
                    value={subject.examFormat}
                    placeholder="مثال: 6 أسئلة نختار 4"
                    onChange={(event) => {
                      const value = event.target.value;
                      updateSubject(subject.id, (current) => ({ ...current, examFormat: value }));
                    }}
                  />
                </div>
                <div className="field">
                  <label>المقرر</label>
                  <textarea
                    rows={2}
                    value={subject.curriculum}
                    placeholder="مثال: من بداية الكتاب لحد صفحة 261"
                    onChange={(event) => {
                      const value = event.target.value;
                      updateSubject(subject.id, (current) => ({ ...current, curriculum: value }));
                    }}
                  />
                </div>
              </div>

              <div className="grid-2">
                <div className="field">
                  <label>وصلنا لحد فين</label>
                  <textarea
                    rows={2}
                    value={subject.progress}
                    placeholder="سيبه فاضي وهو مش هيظهر في الموقع"
                    onChange={(event) => {
                      const value = event.target.value;
                      updateSubject(subject.id, (current) => ({ ...current, progress: value }));
                    }}
                  />
                  <span className="hint">لو فاضي: القسم مخفي تماماً في الصفحة العامة.</span>
                </div>
                <div className="field">
                  <label>الملغي (اختياري)</label>
                  <textarea
                    rows={2}
                    value={subject.cancelled}
                    placeholder="مثال: جزء الميدترم من ص 143 إلى ص 155"
                    onChange={(event) => {
                      const value = event.target.value;
                      updateSubject(subject.id, (current) => ({ ...current, cancelled: value }));
                    }}
                  />
                  <span className="hint">لو فاضي: شارة "الملغي" مش هتظهر.</span>
                </div>
              </div>

              <div className="section-divider">الأسئلة المحددة</div>

              {subject.groups.length === 0 && (
                <div className="empty-state">مفيش مجموعات أسئلة — الموقع مش هيعرض القسم ده.</div>
              )}

              {subject.groups.map((group, groupIndex) => (
                <div className="group-box" key={group.id}>
                  <div className="group-head">
                    <input
                      type="text"
                      value={group.title}
                      placeholder={`عنوان المجموعة ${groupIndex + 1} (مثال: أسئلة هامة جداً)`}
                      aria-label="عنوان المجموعة"
                      onChange={(event) => {
                        const value = event.target.value;
                        updateGroup(subject.id, group.id, (current) => ({ ...current, title: value }));
                      }}
                    />
                    <div className="se-actions">
                      <button
                        type="button"
                        className="btn btn-ghost btn-icon"
                        title="لأعلى"
                        disabled={groupIndex === 0}
                        onClick={() => moveGroup(subject.id, group.id, -1)}
                      >
                        ▲
                      </button>
                      <button
                        type="button"
                        className="btn btn-ghost btn-icon"
                        title="لأسفل"
                        disabled={groupIndex === subject.groups.length - 1}
                        onClick={() => moveGroup(subject.id, group.id, 1)}
                      >
                        ▼
                      </button>
                      <button
                        type="button"
                        className="btn btn-danger btn-sm"
                        onClick={() => removeGroup(subject.id, group.id)}
                      >
                        حذف المجموعة
                      </button>
                    </div>
                  </div>

                  {group.items.length === 0 && (
                    <div className="hint" style={{ marginBottom: 8 }}>
                      المجموعة فاضية — ضيف أسئلة عشان تظهر في الموقع.
                    </div>
                  )}

                  {group.items.map((item, itemIndex) => (
                    <div className="item-row" key={item.id}>
                      <div className="item-num">{itemIndex + 1}</div>
                      <textarea
                        className="item-text"
                        rows={1}
                        value={item.text}
                        placeholder="نص السؤال / النقطة"
                        aria-label={`السؤال ${itemIndex + 1}`}
                        onChange={(event) => {
                          const value = event.target.value;
                          updateGroup(subject.id, group.id, (current) => ({
                            ...current,
                            items: current.items.map((entry) =>
                              entry.id === item.id ? { ...entry, text: value } : entry,
                            ),
                          }));
                        }}
                      />
                      <div className="item-actions">
                        <button
                          type="button"
                          className="btn btn-ghost btn-icon"
                          title="لأعلى"
                          disabled={itemIndex === 0}
                          onClick={() => moveItem(subject.id, group.id, item.id, -1)}
                        >
                          ▲
                        </button>
                        <button
                          type="button"
                          className="btn btn-ghost btn-icon"
                          title="لأسفل"
                          disabled={itemIndex === group.items.length - 1}
                          onClick={() => moveItem(subject.id, group.id, item.id, 1)}
                        >
                          ▼
                        </button>
                        <button
                          type="button"
                          className="btn btn-danger btn-icon"
                          title="حذف"
                          onClick={() => removeItem(subject.id, group.id, item.id)}
                        >
                          ✕
                        </button>
                      </div>
                    </div>
                  ))}

                  <div className="inline-actions">
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      onClick={() => addItem(subject.id, group.id)}
                    >
                      + إضافة سؤال
                    </button>
                  </div>
                </div>
              ))}

              <div className="inline-actions">
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  onClick={() => addGroup(subject.id)}
                >
                  + مجموعة أسئلة جديدة
                </button>
              </div>
            </div>
          ))}

          <div className="inline-actions">
            <button type="button" className="btn btn-gold" onClick={addSubject}>
              + إضافة مادة
            </button>
          </div>
        </section>

        {/* ------- كلمة المرور ------- */}
        <section className="panel">
          <h2 className="panel-title">
            <span className="dot" />
            كلمة المرور
          </h2>

          {!showPassword ? (
            <button type="button" className="btn btn-ghost" onClick={() => setShowPassword(true)}>
              تغيير كلمة المرور
            </button>
          ) : (
            <PasswordForm
              onDone={(message) => {
                setShowPassword(false);
                setToast({ type: 'ok', message });
              }}
              onError={(message) => setToast({ type: 'err', message })}
              onCancel={() => setShowPassword(false)}
            />
          )}
        </section>
      </div>

      <div className="save-bar">
        <div className={`save-status ${dirty ? 'dirty' : ''}`}>
          {dirty ? '⚠️ فيه تغييرات مش متحفظة' : '✔️ كل التغييرات محفوظة'}
        </div>
        <div className="save-actions">
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={handleReload}
            disabled={saving}
            title="إعادة تحميل البيانات من قاعدة البيانات"
          >
            تحديث
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={handleSave}
            disabled={saving || !dirty}
          >
            {saving ? 'جاري الحفظ…' : 'حفظ التغييرات'}
          </button>
        </div>
      </div>
    </div>
  );
}

function PasswordForm({
  onDone,
  onError,
  onCancel,
}: {
  onDone: (message: string) => void;
  onError: (message: string) => void;
  onCancel: () => void;
}) {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (next.length < 8) {
      onError('كلمة المرور الجديدة لازم تكون 8 حروف على الأقل.');
      return;
    }
    if (next !== confirm) {
      onError('كلمة المرور الجديدة والتأكيد مش متطابقين.');
      return;
    }

    setLoading(true);
    try {
      const response = await fetch('/api/auth/password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ current, next, confirm }),
      });
      const data = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        onError(data.error || 'تعذّر تغيير كلمة المرور.');
        return;
      }
      setCurrent('');
      setNext('');
      setConfirm('');
      onDone('تم تغيير كلمة المرور ✅');
    } catch {
      onError('تعذّر الاتصال بالسيرفر.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <div className="field">
        <label htmlFor="pw-current">كلمة المرور الحالية</label>
        <input
          id="pw-current"
          type="password"
          value={current}
          onChange={(event) => setCurrent(event.target.value)}
          autoComplete="current-password"
          required
        />
      </div>
      <div className="grid-2">
        <div className="field">
          <label htmlFor="pw-next">كلمة المرور الجديدة</label>
          <input
            id="pw-next"
            type="password"
            value={next}
            onChange={(event) => setNext(event.target.value)}
            autoComplete="new-password"
            placeholder="8 حروف على الأقل"
            required
          />
        </div>
        <div className="field">
          <label htmlFor="pw-confirm">تأكيد الجديدة</label>
          <input
            id="pw-confirm"
            type="password"
            value={confirm}
            onChange={(event) => setConfirm(event.target.value)}
            autoComplete="new-password"
            required
          />
        </div>
      </div>
      <div className="inline-actions">
        <button className="btn btn-primary btn-sm" type="submit" disabled={loading}>
          {loading ? 'جاري التغيير…' : 'تغيير كلمة المرور'}
        </button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={onCancel} disabled={loading}>
          إلغاء
        </button>
      </div>
    </form>
  );
}
