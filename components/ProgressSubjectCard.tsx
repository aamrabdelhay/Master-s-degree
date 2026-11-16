'use client';

import { useEffect, useState } from 'react';
import type { PublicSubject } from '@/lib/types';
import {
  countSubjectProgress, getSubjectTopics, groupTopicKey, isTopicCompleted,
  numberedPoints, textTopicKey, type StudentProgress,
} from '@/lib/progress';

function useNow(intervalMs = 1000): number | null {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const id = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);
  return now;
}

function pad(value: number): string {
  return String(Math.max(value, 0)).padStart(2, '0');
}

function Countdown({ examAtIso, now }: { examAtIso: string; now: number | null }) {
  if (now === null) return <div className="timer-box">00d 00h 00m 00s</div>;
  const diff = new Date(examAtIso).getTime() - now;
  if (diff <= 0) return <div className="timer-box started">EXAM STARTED</div>;
  const d = Math.floor(diff / 86_400_000);
  const h = Math.floor((diff % 86_400_000) / 3_600_000);
  const m = Math.floor((diff % 3_600_000) / 60_000);
  const s = Math.floor((diff % 60_000) / 1000);
  return <div className="timer-box" aria-live="off">{pad(d) + 'd ' + pad(h) + 'h ' + pad(m) + 'm ' + pad(s) + 's'}</div>;
}

function ProgressTopicRow({
  subjectId, topicKey, text, number, checked, onToggle,
}: {
  subjectId: string; topicKey: string; text: string; number: number; checked: boolean;
  onToggle: (subjectId: string, key: string, checked: boolean) => void;
}) {
  const checkboxId = subjectId + '-' + topicKey;
  return (
    <label className={'q-row progress-topic' + (checked ? ' is-complete' : '')} htmlFor={checkboxId}>
      <span className="q-num" aria-hidden="true">{number}</span>
      <span className="progress-topic-text">{text}</span>
      <input id={checkboxId} className="progress-checkbox" type="checkbox" checked={checked}
        onChange={(event) => onToggle(subjectId, topicKey, event.currentTarget.checked)}
        aria-label={'خلصت: ' + text} />
    </label>
  );
}

function NumberedTextBox({
  subjectId, text, variant, progress, onToggle,
}: {
  subjectId: string; text: string; variant: 'curriculum' | 'progress';
  progress: StudentProgress; onToggle: (subjectId: string, key: string, checked: boolean) => void;
}) {
  const points = numberedPoints(text);
  return (
    <div className={'numbered-box ' + variant + '-box'} role="list">
      {points.map((point, index) => {
        const key = textTopicKey(variant, point);
        return <ProgressTopicRow key={key + '-' + index} subjectId={subjectId} topicKey={key}
          text={point} number={index + 1}
          checked={isTopicCompleted(progress, subjectId, key)} onToggle={onToggle} />;
      })}
    </div>
  );
}

export default function SubjectCard({
  subject, progress, progressLoaded, onToggle, onReset,
}: {
  subject: PublicSubject; progress: StudentProgress; progressLoaded: boolean;
  onToggle: (subjectId: string, key: string, checked: boolean) => void;
  onReset: (subjectId: string) => void;
}) {
  const now = useNow(1000);
  const target = subject.examAtIso ? new Date(subject.examAtIso).getTime() : null;
  const finished = target !== null && now !== null && target - now <= 0;
  const hasExamFormat = Boolean(subject.examFormat.trim());
  const hasCurriculum = Boolean(subject.curriculum.trim());
  const hasProgress = Boolean(subject.progress.trim());
  const groups = subject.groups.filter((group) => group.items.length > 0);
  const hasContent = hasExamFormat || hasCurriculum || hasProgress ||
    Boolean(subject.cancelled.trim()) || groups.length > 0;
  const topicProgress = countSubjectProgress(subject, progress);
  const totalTopics = getSubjectTopics(subject).length;

  return (
    <article className="subject-card" data-aos="fade-up" id={subject.id}>
      <div className="card-progress" aria-label={'تقدم المادة ' + topicProgress.percent + '%'}>
        <div className="card-progress-meta">
          <strong>تقدم المادة</strong>
          <span>{(progressLoaded ? topicProgress.completed : 0) + ' من ' + totalTopics + ' موضوع'}</span>
          <b>{(progressLoaded ? topicProgress.percent : 0) + '%'}</b>
        </div>
        <div className="progress-track" role="progressbar" aria-valuemin={0} aria-valuemax={100}
          aria-valuenow={progressLoaded ? topicProgress.percent : 0} aria-label="نسبة إنجاز المادة">
          <span style={{ width: (progressLoaded ? topicProgress.percent : 0) + '%' }} />
        </div>
        {totalTopics > 0 && <button type="button" className="reset-progress-button" onClick={() => onReset(subject.id)}>تصفير تقدم المادة</button>}
      </div>

      <div className="card-header">
        <div className="subject-heading">
          <h2 className="subject-name">
            {subject.name}
            {finished && <span className="done-chip">✓ انتهى</span>}
          </h2>
          {subject.examAtLabel && <div className="exam-date">{subject.examAtLabel}</div>}
        </div>
        {subject.examAtIso && <Countdown examAtIso={subject.examAtIso} now={now} />}
      </div>

      {(hasContent || !subject.examAtIso) && (
        <div className="card-body">
          {!subject.examAtIso && <div className="pending-date-note">الموعد لم يُحدد بعد</div>}
          {hasExamFormat && (
            <div className="important-badge">
              <div className="badge-line"><span className="badge-label">شكل الامتحان:</span> {subject.examFormat}</div>
            </div>
          )}
          {hasCurriculum && (
            <>
              <span className="section-tag">المقرر</span>
              <NumberedTextBox subjectId={subject.id} text={subject.curriculum}
                variant="curriculum" progress={progress} onToggle={onToggle} />
            </>
          )}
          {subject.cancelled.trim() && (
            <div className="cancel-badge"><span className="badge-label">⚠️ الملغي:</span> {subject.cancelled}</div>
          )}
          {hasProgress && (
            <>
              <span className="section-tag">وصلنا لحد فين</span>
              <NumberedTextBox subjectId={subject.id} text={subject.progress}
                variant="progress" progress={progress} onToggle={onToggle} />
            </>
          )}
          {groups.map((group) => (
            <section key={group.id}>
              <span className="section-tag">{group.title || 'الأسئلة المحددة'}</span>
              {group.items.map((item, index) => {
                const key = groupTopicKey(item.id);
                return <ProgressTopicRow key={item.id} subjectId={subject.id} topicKey={key}
                  text={item.text} number={index + 1}
                  checked={isTopicCompleted(progress, subject.id, key)} onToggle={onToggle} />;
              })}
            </section>
          ))}
        </div>
      )}

      {subject.bookUrl && (
        <div className="card-body" style={{ paddingTop: hasContent ? 0 : 12 }}>
          <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
            <a className="telegram-btn" href={subject.bookUrl} target="_blank" rel="noopener noreferrer"
              style={{ width: 'auto', padding: '7px 15px', marginTop: 8, gap: 7, fontSize: '0.88rem', borderRadius: 9 }}>
              📖 الكتاب
            </a>
          </div>
        </div>
      )}
    </article>
  );
}
