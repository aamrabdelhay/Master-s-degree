'use client';

import { useEffect, useMemo, useState } from 'react';
import type { PublicSubject } from '@/lib/types';
import { countSubjectProgress, type StudentProgress } from '@/lib/progress';
import {
  buildStudyPlan, cairoDateKey, type StudyPlanOptions, type StudyPlanResult,
} from '@/lib/studyPlan';

const OPTIONS_KEY = 'lawdiploma:study-plan-options:v1';
const WEEK_DAYS = [
  { value: 0, label: 'الأحد' }, { value: 1, label: 'الاثنين' },
  { value: 2, label: 'الثلاثاء' }, { value: 3, label: 'الأربعاء' },
  { value: 4, label: 'الخميس' }, { value: 5, label: 'الجمعة' },
  { value: 6, label: 'السبت' },
];
const DEFAULT_OPTIONS: StudyPlanOptions = { restDays: [], includeFriday: false };

function readOptions(): StudyPlanOptions {
  try {
    const raw = window.localStorage.getItem(OPTIONS_KEY);
    if (!raw) return DEFAULT_OPTIONS;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return DEFAULT_OPTIONS;
    const candidate = parsed as Record<string, unknown>;
    const restDays = Array.isArray(candidate.restDays)
      ? candidate.restDays.filter((day): day is number =>
        Number.isInteger(day) && Number(day) >= 0 && Number(day) <= 6)
      : DEFAULT_OPTIONS.restDays;
    return { restDays, includeFriday: candidate.includeFriday === true };
  } catch {
    return DEFAULT_OPTIONS;
  }
}

function formatPlanDate(dateKey: string): string {
  return new Intl.DateTimeFormat('ar-EG-u-nu-latn', {
    timeZone: 'Africa/Cairo', weekday: 'long', day: 'numeric', month: 'long',
  }).format(new Date(dateKey + 'T12:00:00.000Z'));
}

function todayMessage(plan: StudyPlanResult, today: string): string {
  const todayPlan = plan.days.find((day) => day.date === today);
  if (todayPlan && todayPlan.items.length > 0) {
    return todayPlan.items.map((item) => {
      if (item.kind === 'final-review') return 'مراجعة نهائية لـ ' + item.subjectName;
      if (item.kind === 'review') return 'مراجعة ' + item.subjectName;
      return item.subjectName + ' — ' + item.topics + ' موضوع';
    }).join('، ');
  }
  if (plan.examToday.length > 0) return 'امتحان النهارده: ' + plan.examToday.map((item) => item.name).join('، ');
  return 'مفيش مذاكرة محددة النهارده حسب المواعيد وأيام الراحة المختارة.';
}

export default function StudyPlanner({
  subjects, progress,
}: {
  subjects: PublicSubject[];
  progress: StudentProgress;
}) {
  const [options, setOptions] = useState<StudyPlanOptions>(DEFAULT_OPTIONS);
  const [optionsLoaded, setOptionsLoaded] = useState(false);
  const [today, setToday] = useState('');

  useEffect(() => {
    setOptions(readOptions());
    setOptionsLoaded(true);
    setToday(cairoDateKey(new Date()));
  }, []);

  useEffect(() => {
    if (!optionsLoaded) return;
    try { window.localStorage.setItem(OPTIONS_KEY, JSON.stringify(options)); } catch {
      // إعدادات الجدول اختيارية؛ تعطل التخزين لا يمنع حسابه.
    }
  }, [options, optionsLoaded]);

  const plan = useMemo(() => {
    if (!today) return null;
    return buildStudyPlan(today, subjects.map((subject) => ({
      id: subject.id,
      name: subject.name,
      examAtIso: subject.examAtIso,
      remainingTopics: countSubjectProgress(subject, progress).remaining,
    })), options);
  }, [today, subjects, progress, options]);

  function toggleRestDay(day: number, checked: boolean) {
    setOptions((current) => ({
      ...current,
      restDays: checked
        ? [...new Set([...current.restDays, day])].sort((a, b) => a - b)
        : current.restDays.filter((value) => value !== day),
    }));
  }

  return (
    <section className="study-plan-panel" aria-labelledby="study-plan-title">
      <div className="study-plan-heading">
        <div>
          <h2 id="study-plan-title">جدول المذاكرة المقترح</h2>
          <p>بيتحدّث تلقائيًا حسب مواعيد الامتحانات والموضوعات اللي خلصتها.</p>
        </div>
        <span className="study-plan-chip">على جهازك بس</span>
      </div>

      <div className="study-plan-options">
        <div>
          <strong>أيام الراحة الأسبوعية</strong>
          <div className="rest-day-options">
            {WEEK_DAYS.map((day) => (
              <label key={day.value}>
                <input type="checkbox" checked={options.restDays.includes(day.value)}
                  onChange={(event) => toggleRestDay(day.value, event.currentTarget.checked)} />
                <span>{day.label}</span>
              </label>
            ))}
          </div>
        </div>
        <label className="include-friday-option">
          <input type="checkbox" checked={options.includeFriday}
            onChange={(event) => setOptions((current) => ({
              ...current, includeFriday: event.currentTarget.checked,
            }))} />
          <span>احسب يوم الجمعة ضمن أيام المذاكرة</span>
        </label>
      </div>

      {!plan ? (
        <p className="study-plan-empty">بنجهّز جدول المذاكرة…</p>
      ) : (
        <>
          <div className="today-study">
            <span>النهارده تذاكر:</span>
            <strong>{todayMessage(plan, today)}</strong>
          </div>

          {plan.insufficientDays && (
            <div className="study-plan-warning" role="status">
              الأيام المتاحة أقل من عدد الموضوعات المتبقية أو فيه مادة موعدها قريب ومش واخدة أيام كفاية.
              المتبقي {plan.totalRemainingTopics} موضوع، وأيام المذاكرة المتاحة {plan.availableStudyDays}.
              {plan.unscheduledSubjects.length > 0 && (
                <span> مواد محتاجة أولوية: {plan.unscheduledSubjects.map((item) => item.name).join('، ')}.</span>
              )}
            </div>
          )}

          {plan.days.length > 0 ? (
            <div className="study-plan-days">
              <h3>الأيام الجاية</h3>
              {plan.days.map((day) => (
                <article className={'study-plan-day' + (day.isToday ? ' is-today' : '')} key={day.date}>
                  <div className="study-plan-date">{formatPlanDate(day.date)}{day.isToday && <b>النهارده</b>}</div>
                  <div className="study-plan-assignments">
                    {day.items.map((item, index) => (
                      <div className="study-plan-assignment" key={item.subjectId + '-' + item.kind + '-' + index}>
                        <strong>{item.subjectName}</strong>
                        <span>
                          {item.kind === 'final-review' ? 'مراجعة نهائية قبل الامتحان'
                            : item.kind === 'review' ? 'مراجعة فقط'
                              : item.topics + ' موضوع مقترح'}
                        </span>
                      </div>
                    ))}
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <p className="study-plan-empty">مفيش أيام مذاكرة جاية متاحة قبل الامتحانات المسجلة.</p>
          )}

          {plan.undatedSubjects.length > 0 && (
            <div className="undated-subjects">
              <h3>لسه موعدها ما اتحددش</h3>
              <p>المواد دي مش داخلة في حساب الأيام لحد ما يتسجل موعد امتحانها.</p>
              <div>{plan.undatedSubjects.map((subject) => <span key={subject.id}>{subject.name}</span>)}</div>
            </div>
          )}
        </>
      )}
    </section>
  );
}
