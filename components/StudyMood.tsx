'use client';

import { useEffect, useMemo, useState } from 'react';
import type { PublicSubject } from '@/lib/types';
import { addPlanDays, cairoDateKey } from '@/lib/studyPlan';
import { distributeStudyUnits, estimateStudyMinutes, parseStudyUnits, type ParsedStudyUnit, type StudyMode, type StoredSubjectPlan } from '@/lib/studyMood';
import { getOrCreateAnonymousDeviceId } from '@/lib/clientIdentity';

const STORAGE_KEY = 'lawdiploma:study-mood:v1';
const WEEK_DAYS = [
  { value: 0, label: 'الأحد', short: 'أحد' },
  { value: 1, label: 'الاثنين', short: 'اثنين' },
  { value: 2, label: 'الثلاثاء', short: 'ثلاثاء' },
  { value: 3, label: 'الأربعاء', short: 'أربعاء' },
  { value: 4, label: 'الخميس', short: 'خميس' },
  { value: 5, label: 'الجمعة', short: 'جمعة' },
  { value: 6, label: 'السبت', short: 'سبت' },
];
const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];

type TimerState = { durationMinutes: number; remainingSeconds: number; endAt: number | null };

function readPlans(): Record<string, StoredSubjectPlan> {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || '{}') as { plans?: unknown };
    if (!parsed.plans || typeof parsed.plans !== 'object' || Array.isArray(parsed.plans)) return {};
    return parsed.plans as Record<string, StoredSubjectPlan>;
  } catch { return {}; }
}

function formatDate(dateKey: string, options?: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat('ar-EG', {
    timeZone: 'Africa/Cairo', weekday: 'long', day: 'numeric', month: 'long', ...options,
  }).format(new Date(dateKey + 'T12:00:00.000Z'));
}

function formatMinutes(minutes: number): string {
  const safe = Math.max(0, Math.round(minutes));
  const hours = Math.floor(safe / 60);
  const mins = safe % 60;
  if (hours && mins) return hours + ' ساعة و' + mins + ' دقيقة';
  if (hours) return hours + ' ساعة';
  return mins + ' دقيقة';
}

function pad(value: number): string { return String(Math.max(0, value)).padStart(2, '0'); }

function Countdown({ examAtIso, now }: { examAtIso: string | null; now: number }) {
  if (!examAtIso) return <div className="timer-box pending">موعد الامتحان لم يُحدد</div>;
  const diff = new Date(examAtIso).getTime() - now;
  if (diff <= 0) return <div className="timer-box started">المادة خلصت</div>;
  const days = Math.floor(diff / 86_400_000);
  const hours = Math.floor((diff % 86_400_000) / 3_600_000);
  const minutes = Math.floor((diff % 3_600_000) / 60_000);
  const seconds = Math.floor((diff % 60_000) / 1000);
  return <div className="timer-box" aria-live="off">{pad(days) + 'd ' + pad(hours) + 'h ' + pad(minutes) + 'm ' + pad(seconds) + 's'}</div>;
}

function modeLabel(mode: StudyMode): string {
  if (mode === 'one-day') return 'يوم واحد';
  if (mode === 'three-days') return '٣ أيام';
  if (mode === 'week') return 'أسبوع';
  return 'لحد قبل الامتحان';
}

function makeDateRange(from: string, to: string): string[] {
  const output: string[] = [];
  for (let date = from, guard = 0; date <= to && guard < 366; date = addPlanDays(date, 1), guard += 1) {
    output.push(date);
  }
  return output;
}

function getPlanDates(
  mode: StudyMode,
  examAtIso: string | null,
  selectedDays: number[],
): { studyDates: string[]; calendarDates: string[]; message: string } {
  const now = new Date();
  const today = cairoDateKey(now);
  const deadline = examAtIso ? new Date(examAtIso).getTime() - 12 * 60 * 60 * 1000 : null;
  if (deadline !== null && (!Number.isFinite(deadline) || deadline <= now.getTime())) {
    return { studyDates: [], calendarDates: [], message: 'موعد الامتحان بقى أقل من ١٢ ساعة؛ مفيش وقت متاح للتقسيم قبل الموعد النهائي.' };
  }

  let horizon: string;
  let note = '';
  if (deadline !== null) {
    horizon = cairoDateKey(new Date(deadline));
  } else {
    horizon = addPlanDays(today, mode === 'until-exam' || mode === 'week' ? 6 : 30);
    if (mode === 'until-exam') note = 'موعد الامتحان غير محدد؛ اتعمل جدول أسبوع مؤقت.';
  }

  if (mode === 'week' || (mode === 'until-exam' && !examAtIso)) {
    const weekEnd = addPlanDays(today, 6);
    if (horizon > weekEnd) horizon = weekEnd;
  }
  const allDates = makeDateRange(today, horizon);
  const candidates = allDates.filter((date) =>
    selectedDays.includes(new Date(date + 'T12:00:00.000Z').getUTCDay()),
  );

  let studyDates = candidates;
  if (mode === 'one-day') studyDates = candidates.slice(0, 1);
  if (mode === 'three-days') studyDates = candidates.slice(0, 3);
  if (mode === 'week') studyDates = candidates.slice(0, 7);
  if (mode === 'until-exam' && !examAtIso) studyDates = candidates.slice(0, 7);

  if (studyDates.length === 0) {
    return { studyDates: [], calendarDates: [], message: 'لا توجد أيام مذاكرة محددة.' };
  }

  const calendarEnd = mode === 'week' || (mode === 'until-exam' && !examAtIso)
    ? addPlanDays(today, 6)
    : studyDates[studyDates.length - 1];
  const cappedEnd = calendarEnd > horizon ? horizon : calendarEnd;
  return { studyDates, calendarDates: makeDateRange(today, cappedEnd), message: note };
}

function getSubjectUnits(subject: PublicSubject): ParsedStudyUnit[] {
  const lines = subject.curriculum.split(/\r?\n/);
  const selectedQuestions = subject.groups.flatMap((group) => group.items.map((item) => item.text));
  return parseStudyUnits([...lines, ...selectedQuestions]);
}

export default function StudyMood({ subjects }: { subjects: PublicSubject[] }) {
  const [plans, setPlans] = useState<Record<string, StoredSubjectPlan>>({});
  const [loaded, setLoaded] = useState(false);
  const [selectedSubjectId, setSelectedSubjectId] = useState<string | null>(null);
  const [mode, setMode] = useState<StudyMode>('week');
  const [selectedDays, setSelectedDays] = useState<number[]>(ALL_DAYS);
  const [customPages, setCustomPages] = useState('');
  const [planMessage, setPlanMessage] = useState('');
  const [now, setNow] = useState(Date.now());
  const [rank, setRank] = useState<{ percentile: number | null; sampleSize: number } | null>(null);
  const [rankLoading, setRankLoading] = useState(false);
  const [timer, setTimer] = useState<TimerState>({ durationMinutes: 25, remainingSeconds: 25 * 60, endAt: null });
  const [customTimer, setCustomTimer] = useState('45');

  useEffect(() => {
    setPlans(readPlans());
    setLoaded(true);
    setNow(Date.now());
    const interval = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!loaded) return;
    try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, plans })); } catch {
      // The plan remains usable for this tab even when browser storage is disabled.
    }
  }, [plans, loaded]);

  useEffect(() => {
    if (!timer.endAt) return;
    const interval = window.setInterval(() => {
      setTimer((current) => {
        if (!current.endAt) return current;
        const remaining = Math.max(0, Math.ceil((current.endAt - Date.now()) / 1000));
        return { ...current, remainingSeconds: remaining, endAt: remaining === 0 ? null : current.endAt };
      });
    }, 250);
    return () => window.clearInterval(interval);
  }, [timer.endAt]);

  const totals = useMemo(() => Object.values(plans).reduce((sum, plan) => {
    const allUnits = plan.entries.reduce((value, entry) => value + entry.units, 0);
    const doneUnits = plan.entries.filter((entry) => entry.completed).reduce((value, entry) => value + entry.units, 0);
    return { allUnits: sum.allUnits + allUnits, doneUnits: sum.doneUnits + doneUnits };
  }, { allUnits: 0, doneUnits: 0 }), [plans]);

  const percent = totals.allUnits === 0 ? 0 : Math.round(totals.doneUnits / totals.allUnits * 100);

  useEffect(() => {
    if (!loaded || totals.allUnits === 0) return;
    let cancelled = false;
    setRankLoading(true);
    const timeout = window.setTimeout(() => {
      const deviceId = getOrCreateAnonymousDeviceId();
      void fetch('/api/analytics/track', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event: 'score', deviceId, score: percent }),
      }).then(async (response) => {
        const data = await response.json().catch(() => ({})) as { percentile?: number | null; sampleSize?: number };
        if (!cancelled && response.ok) {
          setRank({ percentile: typeof data.percentile === 'number' ? data.percentile : null, sampleSize: Number(data.sampleSize) || 0 });
        }
      }).catch(() => undefined).finally(() => { if (!cancelled) setRankLoading(false); });
    }, 900);
    return () => { cancelled = true; window.clearTimeout(timeout); };
  }, [loaded, percent, totals.allUnits]);

  const selectedSubject = subjects.find((subject) => subject.id === selectedSubjectId) || null;
  const selectedPlan = selectedSubject ? plans[selectedSubject.id] : undefined;
  const parsedUnits = useMemo(
    () => selectedSubject ? getSubjectUnits(selectedSubject) : [],
    [selectedSubject],
  );
  const parsedPages = parsedUnits.filter((unit) => unit.kind === 'pages').reduce((sum, unit) => sum + unit.units, 0);
  const parsedTopics = parsedUnits.filter((unit) => unit.kind === 'topic').length;
  const estimatedTotalMinutes = parsedUnits.reduce((sum, unit) => sum + estimateStudyMinutes(unit.kind, unit.units), 0);

  function openSubject(subject: PublicSubject) {
    setSelectedSubjectId(subject.id);
    const previous = plans[subject.id];
    setMode(previous?.mode || 'week');
    setSelectedDays(previous?.selectedDays || ALL_DAYS);
    setCustomPages(previous?.customPages ? String(previous.customPages) : '');
    setPlanMessage('');
  }

  function toggleDay(day: number, checked: boolean) {
    setSelectedDays((current) => checked
      ? [...new Set([...current, day])].sort((a, b) => a - b)
      : current.filter((entry) => entry !== day));
  }

  function generatePlan() {
    if (!selectedSubject) return;
    const customValue = customPages.trim() ? Number(customPages) : null;
    if (customValue !== null && (!Number.isInteger(customValue) || customValue < 1 || customValue > 10000)) {
      setPlanMessage('قيمة عدد الصفحات غير صالحة.');
      return;
    }
    const parsed = customValue
      ? [{ id: 'manual-pages', title: 'عدد الصفحات اللي حددته', kind: 'pages' as const, units: customValue, startPage: 1 }]
      : parsedUnits;
    if (parsed.length === 0) {
      setPlanMessage('لا يوجد محتوى مقرر متاح لهذه المادة.');
      return;
    }
    if (selectedDays.length === 0) {
      setPlanMessage('لم يتم تحديد أيام للمذاكرة.');
      return;
    }
    const dateResult = getPlanDates(mode, selectedSubject.examAtIso, selectedDays);
    if (dateResult.studyDates.length === 0) {
      setPlanMessage(dateResult.message);
      return;
    }
    const entries = distributeStudyUnits(parsed, dateResult.studyDates);
    const totalUnits = entries.reduce((sum, entry) => sum + entry.units, 0);
    const totalMinutes = entries.reduce((sum, entry) => sum + entry.minutes, 0);
    const plan: StoredSubjectPlan = {
      mode, selectedDays, customPages: customValue, calendarDates: dateResult.calendarDates,
      entries, totalUnits, totalMinutes, createdAt: new Date().toISOString(),
    };
    setPlans((current) => ({ ...current, [selectedSubject.id]: plan }));
    setPlanMessage((dateResult.message ? dateResult.message + ' ' : '') +
      'اتقسم المقرر على ' + dateResult.studyDates.length + ' يوم، وآخر يوم للمذاكرة قبل موعد الامتحان بـ١٢ ساعة على الأقل.');
  }

  function toggleEntry(subjectId: string, entryId: string, checked: boolean) {
    setPlans((current) => {
      const plan = current[subjectId];
      if (!plan) return current;
      return {
        ...current,
        [subjectId]: {
          ...plan,
          entries: plan.entries.map((entry) => entry.id === entryId ? { ...entry, completed: checked } : entry),
        },
      };
    });
  }

  function setTimerPreset(minutes: number) {
    const safe = Math.max(1, Math.min(180, Math.round(minutes)));
    setTimer({ durationMinutes: safe, remainingSeconds: safe * 60, endAt: null });
  }

  function startPauseTimer() {
    setTimer((current) => {
      if (current.endAt) {
        return { ...current, remainingSeconds: Math.max(0, Math.ceil((current.endAt - Date.now()) / 1000)), endAt: null };
      }
      const remaining = current.remainingSeconds > 0 ? current.remainingSeconds : current.durationMinutes * 60;
      return { ...current, remainingSeconds: remaining, endAt: Date.now() + remaining * 1000 };
    });
  }

  function resetTimer() {
    setTimer((current) => ({ ...current, remainingSeconds: current.durationMinutes * 60, endAt: null }));
  }

  function applyCustomTimer() {
    const value = Number(customTimer);
    if (!Number.isFinite(value) || value < 1 || value > 180) return;
    setTimerPreset(value);
  }

  const timerMinutes = Math.floor(timer.remainingSeconds / 60);
  const timerSeconds = timer.remainingSeconds % 60;
  const modeOptions: { value: StudyMode; label: string }[] = [
    { value: 'one-day', label: 'يوم واحد' },
    { value: 'three-days', label: '٣ أيام' },
    { value: 'week', label: 'أسبوع' },
    { value: 'until-exam', label: 'حسب موعد الامتحان' },
  ];

  return (
    <main className="container study-mood-page">
      <section className="sm-overview">
        <div className="sm-overview-copy">
          <span className="sm-eyebrow">YOUR STUDY SPACE</span>
          <h1>مساحة المذاكرة</h1>
        </div>
        <div className="sm-progress-overview">
          <div><span>إنجاز خطتك</span><strong>{percent}%</strong></div>
          <div className="sm-progress-track"><span style={{ width: percent + '%' }} /></div>
          <small>{totals.doneUnits} من {totals.allUnits} وحدة مذاكرة مكتملة</small>
        </div>
      </section>

      <section className="sm-rank-panel">
        <div className="sm-rank-mark" aria-hidden="true">%</div>
        <div>
          <strong>
            {rankLoading ? 'بنحسب ترتيب تقدمك…'
              : rank && rank.percentile !== null ? 'أنت أفضل من ' + rank.percentile + '% من الدارسين المشاركين'
                : 'لا يوجد ترتيب متاح حاليًا'}
          </strong>
          <p>{rank && rank.sampleSize > 0 ? 'المقارنة مبنية على ' + rank.sampleSize + ' جهاز مشارك.' : 'لسه مفيش بيانات مقارنة كفاية.'}</p>
          <small>تفاصيل جدولك وعلامات الإنجاز محفوظة على جهازك فقط. للمقارنة بنرسل نسبة الإنجاز العامة ومعرّفًا عشوائيًا، من غير أسماء أو محتوى المقرر.</small>
        </div>
      </section>

      <section className="sm-subject-section">
        <div className="sm-section-heading">
          <div><h2>موادك</h2></div>
          <span>{subjects.length} مواد</span>
        </div>
        <div className="sm-subject-grid">
          {subjects.map((subject) => {
            const plan = plans[subject.id];
            const done = plan ? plan.entries.filter((entry) => entry.completed).reduce((sum, entry) => sum + entry.units, 0) : 0;
            const total = plan?.totalUnits || 0;
            const completion = total ? Math.round(done / total * 100) : 0;
            const previewMinutes = getSubjectUnits(subject).reduce((sum, unit) => sum + estimateStudyMinutes(unit.kind, unit.units), 0);
            const active = selectedSubjectId === subject.id;
            return (
              <button type="button" key={subject.id} className={'sm-subject-card' + (active ? ' is-selected' : '')}
                onClick={() => openSubject(subject)} aria-pressed={active}>
                <div className="sm-subject-card-top"><span className="sm-subject-index">{String(subjects.indexOf(subject) + 1).padStart(2, '0')}</span>
                  <span className="sm-open-label">{active ? 'مفتوحة' : 'افتح الخطة'} <b>↗</b></span></div>
                <h3>{subject.name}</h3>
                <Countdown examAtIso={subject.examAtIso} now={now} />
                <div className="sm-card-progress"><span style={{ width: completion + '%' }} /></div>
                <div className="sm-card-meta">
                  <span>{plan ? completion + '% من الخطة' : 'لم يتم إنشاء خطة بعد'}</span>
                  <span>{plan ? formatMinutes(plan.totalMinutes) : previewMinutes ? formatMinutes(previewMinutes) : '—'}</span>
                </div>
              </button>
            );
          })}
          {subjects.length === 0 && <div className="sm-empty">لسه مفيش مواد مضافة من الأدمن.</div>}
        </div>
      </section>

      {selectedSubject && (
        <section className="sm-plan-workspace" aria-labelledby="sm-selected-title">
          <div className="sm-selected-heading">
            <div>
              <span className="sm-eyebrow">SUBJECT STUDY PLAN</span>
              <h2 id="sm-selected-title">{selectedSubject.name}</h2>
              <Countdown examAtIso={selectedSubject.examAtIso} now={now} />
            </div>
            <button type="button" className="sm-close-detail" onClick={() => setSelectedSubjectId(null)}>إغلاق التفاصيل ×</button>
          </div>

          <div className="sm-planner-config">
            <div className="sm-config-field">
              <strong>عايز تخلص المقرر في قد إيه؟</strong>
              <div className="sm-mode-options">
                {modeOptions.map((option) => (
                  <button type="button" key={option.value} className={mode === option.value ? 'is-active' : ''}
                    onClick={() => setMode(option.value)}>{option.label}</button>
                ))}
              </div>
            </div>

            <div className="sm-config-field">
              <strong>أيام المذاكرة خلال الأسبوع</strong>
              <div className="sm-weekday-options">
                {WEEK_DAYS.map((day) => (
                  <label key={day.value} className={selectedDays.includes(day.value) ? 'is-checked' : ''}>
                    <input type="checkbox" checked={selectedDays.includes(day.value)}
                      onChange={(event) => toggleDay(day.value, event.currentTarget.checked)} />
                    <span>{day.short}</span>
                  </label>
                ))}
              </div>
            </div>

            <div className="sm-config-bottom">
              <label className="sm-custom-pages">
                <span>عدد صفحات مخصص (اختياري)</span>
                <input type="number" inputMode="numeric" min="1" max="10000" value={customPages}
                  onChange={(event) => setCustomPages(event.currentTarget.value)} />
              </label>
              <div className="sm-detected-stats">
                <span><b>{customPages ? Number(customPages) || 0 : parsedPages}</b> صفحة مكتشفة</span>
                <span><b>{customPages ? 0 : parsedTopics}</b> موضوع</span>
                <span>وقت مقترح: <b>{formatMinutes(customPages ? estimateStudyMinutes('pages', Number(customPages) || 0) : estimatedTotalMinutes)}</b></span>
              </div>
            </div>
            <button type="button" className="sm-generate-button" onClick={generatePlan}>قسّم المقرر واعمل التقويم</button>
            {planMessage && <p className="sm-plan-message" role="status">{planMessage}</p>}
          </div>

          {selectedPlan && (
            <div className="sm-calendar-section">
              <div className="sm-calendar-heading">
                <div><h3>تقويم المذاكرة</h3><p>خطة {modeLabel(selectedPlan.mode)} • آخر موعد للمذاكرة قبل الامتحان بـ١٢ ساعة</p></div>
                <div className="sm-calendar-total"><strong>{formatMinutes(selectedPlan.totalMinutes)}</strong><small>إجمالي الوقت المقترح</small></div>
              </div>
              <div className="sm-calendar-weekdays">
                {WEEK_DAYS.map((day) => <span key={day.value}>{day.short}</span>)}
              </div>
              <div className="sm-calendar-grid">
                {(() => {
                  const first = selectedPlan.calendarDates[0];
                  const offset = first ? new Date(first + 'T12:00:00.000Z').getUTCDay() : 0;
                  const cells: (string | null)[] = [...Array(offset).fill(null), ...selectedPlan.calendarDates];
                  while (cells.length % 7 !== 0) cells.push(null);
                  return cells.map((date, index) => {
                    if (!date) return <div className="sm-calendar-cell is-blank" key={'blank-' + index} />;
                    const dayEntries = selectedPlan.entries.filter((entry) => entry.date === date);
                    const allowed = selectedPlan.selectedDays.includes(new Date(date + 'T12:00:00.000Z').getUTCDay());
                    const doneUnits = dayEntries.filter((entry) => entry.completed).reduce((sum, entry) => sum + entry.units, 0);
                    const totalUnits = dayEntries.reduce((sum, entry) => sum + entry.units, 0);
                    return (
                      <div className={'sm-calendar-cell' + (date === cairoDateKey(new Date(now)) ? ' is-today' : '') + (!allowed ? ' is-rest' : '')}
                        key={date}>
                        <div className="sm-calendar-date"><b>{Number(date.slice(-2))}</b><small>{formatDate(date, { weekday: undefined, day: undefined, month: 'short' })}</small></div>
                        {dayEntries.length > 0 ? (
                          <>
                            <div className="sm-day-progress">{doneUnits}/{totalUnits} وحدة</div>
                            <div className="sm-day-tasks">
                              {dayEntries.map((entry) => (
                                <label key={entry.id} className={'sm-task-check' + (entry.completed ? ' is-complete' : '')}>
                                  <input type="checkbox" checked={entry.completed}
                                    onChange={(event) => toggleEntry(selectedSubject.id, entry.id, event.currentTarget.checked)} />
                                  <span>{entry.title}</span>
                                  <small>{formatMinutes(entry.minutes)}</small>
                                </label>
                              ))}
                            </div>
                          </>
                        ) : <span className="sm-day-empty">{allowed ? 'مفيش مهام' : 'راحة'}</span>}
                      </div>
                    );
                  });
                })()}
              </div>
              <div className="sm-calendar-footer">
                <span>{selectedPlan.entries.filter((entry) => entry.completed).length} مهمة مكتملة من {selectedPlan.entries.length}</span>
                <button type="button" onClick={() => {
                  if (!window.confirm('إعادة إنشاء الخطة هتمسح علامات الإنجاز الحالية للمادة. تكمل؟')) return;
                  setPlans((current) => { const next = { ...current }; delete next[selectedSubject.id]; return next; });
                }}>مسح الخطة وإعادة البدء</button>
              </div>
            </div>
          )}
        </section>
      )}

      <section className="sm-focus-panel">
        <div className="sm-focus-copy">
          <span className="sm-eyebrow">FOCUS SESSION</span>
          <h2>جلسة تركيز</h2>
          <div className="sm-timer-presets">
            {[25, 60, 90, 120, 180].map((minutes) => (
              <button type="button" key={minutes} className={timer.durationMinutes === minutes ? 'is-active' : ''}
                onClick={() => setTimerPreset(minutes)}>{minutes === 60 ? 'ساعة' : minutes === 90 ? 'ساعة ونص' : minutes === 120 ? 'ساعتين' : minutes === 180 ? '٣ ساعات' : '٢٥ دقيقة'}</button>
            ))}
          </div>
          <div className="sm-custom-timer">
            <label htmlFor="sm-custom-timer">وقت مخصص بالدقائق</label>
            <input id="sm-custom-timer" type="number" min="1" max="180" value={customTimer}
              onChange={(event) => setCustomTimer(event.currentTarget.value)} />
            <button type="button" onClick={applyCustomTimer}>تطبيق الوقت</button>
          </div>
        </div>
        <div className="sm-timer-face">
          <span className="sm-timer-label">{timer.endAt ? 'جلسة جارية' : timer.remainingSeconds === 0 ? 'انتهت الجلسة' : 'جاهز للتركيز'}</span>
          <strong>{pad(timerMinutes)}:{pad(timerSeconds)}</strong>
          <div className="sm-timer-actions">
            <button type="button" onClick={startPauseTimer}>{timer.endAt ? 'إيقاف مؤقت' : timer.remainingSeconds === 0 ? 'ابدأ من جديد' : 'ابدأ'}</button>
            <button type="button" onClick={resetTimer}>إعادة ضبط</button>
          </div>
        </div>
      </section>

      <p className="sm-local-footnote">كل جدول المذاكرة وعلامات الإنجاز والمؤقت محفوظين محليًا على الجهاز ده، ومش بيتشاركوا مع أي جهاز تاني.</p>
    </main>
  );
}
