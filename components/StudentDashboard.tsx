'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ChangeEvent } from 'react';
import type { PublicSubject } from '@/lib/types';
import SubjectCard from './ProgressSubjectCard';
import StudyPlanner from './StudyPlanner';
import PushNotifications from './PushNotifications';
import {
  collectValidProgressKeys, countSubjectProgress, PROGRESS_STORAGE_KEY,
  sanitizeProgress, type StudentProgress,
} from '@/lib/progress';

const EXPORT_VERSION = 1;

function readStoredProgress(subjects: PublicSubject[]): StudentProgress {
  try {
    const raw = window.localStorage.getItem(PROGRESS_STORAGE_KEY);
    return raw ? sanitizeProgress(JSON.parse(raw) as unknown, subjects) : {};
  } catch {
    return {};
  }
}

export default function StudentDashboard({ subjects }: { subjects: PublicSubject[] }) {
  const [progress, setProgress] = useState<StudentProgress>({});
  const [progressLoaded, setProgressLoaded] = useState(false);
  const importInput = useRef<HTMLInputElement>(null);
  const validKeys = useMemo(() => collectValidProgressKeys(subjects), [subjects]);

  useEffect(() => {
    setProgress(readStoredProgress(subjects));
    setProgressLoaded(true);
    const onStorage = (event: StorageEvent) => {
      if (event.key !== PROGRESS_STORAGE_KEY && event.key !== null) return;
      setProgress(readStoredProgress(subjects));
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [subjects]);

  useEffect(() => {
    if (!progressLoaded) return;
    try {
      const cleaned: StudentProgress = {};
      for (const [subjectId, allowed] of Object.entries(validKeys)) {
        const keys = (progress[subjectId] || []).filter((key) => allowed.has(key));
        if (keys.length > 0) cleaned[subjectId] = [...new Set(keys)];
      }
      window.localStorage.setItem(PROGRESS_STORAGE_KEY, JSON.stringify({
        version: EXPORT_VERSION, completed: cleaned,
      }));
      if (JSON.stringify(cleaned) !== JSON.stringify(progress)) setProgress(cleaned);
    } catch {
      // بعض أوضاع الخصوصية تمنع التخزين؛ يفضل التقدم شغال طول الجلسة.
    }
  }, [progress, progressLoaded, validKeys]);

  const toggleTopic = useCallback((subjectId: string, key: string, checked: boolean) => {
    setProgress((current) => {
      const keys = new Set(current[subjectId] || []);
      if (checked) keys.add(key);
      else keys.delete(key);
      const next = { ...current };
      if (keys.size > 0) next[subjectId] = [...keys];
      else delete next[subjectId];
      return next;
    });
  }, []);

  const resetSubject = useCallback((subjectId: string) => {
    const subject = subjects.find((entry) => entry.id === subjectId);
    if (!subject || !window.confirm('تأكيد تصفير تقدم مادة "' + subject.name + '"؟')) return;
    setProgress((current) => {
      const next = { ...current };
      delete next[subjectId];
      return next;
    });
  }, [subjects]);

  const totals = useMemo(() => subjects.reduce((sum, subject) => {
    const current = countSubjectProgress(subject, progress);
    return { completed: sum.completed + current.completed, total: sum.total + current.total };
  }, { completed: 0, total: 0 }), [subjects, progress]);
  const percent = totals.total === 0 ? 0 : Math.round(totals.completed / totals.total * 100);

  const exportProgress = useCallback(() => {
    try {
      const blob = new Blob([JSON.stringify({
        version: EXPORT_VERSION, exportedAt: new Date().toISOString(), completed: progress,
      }, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = 'law-diploma-study-progress.json';
      anchor.click();
      URL.revokeObjectURL(url);
    } catch {
      window.alert('مش قادرين نصدّر التقدم من المتصفح ده.');
    }
  }, [progress]);

  const importProgress = useCallback(async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = '';
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      window.alert('حجم الملف كبير. اختار ملف أقل من 2 ميجابايت.');
      return;
    }
    try {
      const parsed: unknown = JSON.parse(await file.text());
      setProgress(sanitizeProgress(parsed, subjects));
      window.alert('تم استيراد تقدم المذاكرة على الجهاز ده.');
    } catch {
      window.alert('ملف التقدم مش صالح أو تالف.');
    }
  }, [subjects]);

  return (
    <main className="container student-dashboard">
      <section className="total-progress-panel" aria-labelledby="total-progress-title">
        <div className="total-progress-heading">
          <div>
            <h2 id="total-progress-title">تقدمك في الدبلومة</h2>
            <p>{progressLoaded ? totals.completed + ' من ' + totals.total + ' موضوع خلصتهم' : 'بنحمّل تقدمك من الجهاز…'}</p>
          </div>
          <strong>{(progressLoaded ? percent : 0) + '%'}</strong>
        </div>
        <div className="total-progress-track" role="progressbar" aria-valuemin={0} aria-valuemax={100}
          aria-valuenow={progressLoaded ? percent : 0} aria-label="نسبة التقدم في الدبلومة">
          <span style={{ width: (progressLoaded ? percent : 0) + '%' }} />
        </div>
        <div className="progress-tools">
          <button type="button" onClick={exportProgress}>تصدير التقدم JSON</button>
          <button type="button" onClick={() => importInput.current?.click()}>استيراد التقدم JSON</button>
          <input ref={importInput} type="file" accept="application/json,.json" hidden onChange={importProgress} />
        </div>
        <p className="local-progress-note">التقدم بيتحفظ على جهازك بس، ومش بيظهر لأي طالب تاني.</p>
      </section>

      <StudyPlanner subjects={subjects} progress={progress} />
      <PushNotifications subjects={subjects} />

      {subjects.length === 0 ? (
        <div className="subject-card" data-aos="fade-up">
          <div className="card-body" style={{ textAlign: 'center', color: '#475569' }}>
            لسه مفيش مواد مضافة. جاري تجهيز الجدول…
          </div>
        </div>
      ) : subjects.map((subject) => (
        <SubjectCard key={subject.id} subject={subject} progress={progress}
          progressLoaded={progressLoaded} onToggle={toggleTopic} onReset={resetSubject} />
      ))}
    </main>
  );
}
