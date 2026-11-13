'use client';

import { useEffect, useState } from 'react';
import type { PublicSubject } from '@/lib/types';

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
  if (now === null) {
    // أول لحظة قبل ما العميل يحسب — بنفس مقاس التايمر
    return <div className="timer-box">00d 00h 00m 00s</div>;
  }

  const target = new Date(examAtIso).getTime();
  const diff = target - now;

  if (diff <= 0) {
    return <div className="timer-box started">EXAM STARTED</div>;
  }

  const d = Math.floor(diff / 86_400_000);
  const h = Math.floor((diff % 86_400_000) / 3_600_000);
  const m = Math.floor((diff % 3_600_000) / 60_000);
  const s = Math.floor((diff % 60_000) / 1000);

  return (
    <div className="timer-box" aria-live="off">
      {`${pad(d)}d ${pad(h)}h ${pad(m)}m ${pad(s)}s`}
    </div>
  );
}

function numberedPoints(value: string): string[] {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) =>
      line
        .replace(/^(?:[-*•▪◦‣]+)\s*/, '')
        .replace(/^(?:\d+|[٠-٩۰-۹]+)\s*[.)、:-]\s*/u, '')
        .trim(),
    )
    .filter(Boolean);
}

function NumberedTextBox({
  text,
  variant,
}: {
  text: string;
  variant: 'curriculum' | 'progress';
}) {
  const points = numberedPoints(text);

  return (
    <div className={`numbered-box ${variant}-box`} role="list">
      {points.map((point, index) => (
        <div className="q-row" role="listitem" key={`${index}-${point}`}>
          <span className="q-num" aria-hidden="true">
            {index + 1}
          </span>
          <div>{point}</div>
        </div>
      ))}
    </div>
  );
}

export default function SubjectCard({ subject }: { subject: PublicSubject }) {
  const now = useNow(1000);
  const target = subject.examAtIso ? new Date(subject.examAtIso).getTime() : null;
  const finished = target !== null && now !== null && target - now <= 0;

  const hasExamFormat = Boolean(subject.examFormat.trim());
  const hasCurriculum = Boolean(subject.curriculum.trim());
  const hasProgress = Boolean(subject.progress.trim());
  const groups = subject.groups.filter((group) => group.items.length > 0);
  const hasContent =
    hasExamFormat ||
    hasCurriculum ||
    hasProgress ||
    Boolean(subject.cancelled.trim()) ||
    groups.length > 0;

  return (
    <article className="subject-card" data-aos="fade-up" id={subject.id}>
      <div className="card-header">
        <div className="subject-heading">
          <h2 className="subject-name">
            {subject.name}
            {finished && <span className="done-chip">✓ انتهى</span>}
          </h2>
          {subject.examAtLabel && (
            <div className="exam-date">
              <span className="icon" aria-hidden="true">
                📅
              </span>
              {subject.examAtLabel}
            </div>
          )}
        </div>

        {subject.examAtIso ? (
          <Countdown examAtIso={subject.examAtIso} now={now} />
        ) : (
          <div className="timer-box pending">الموعد لم يُحدد بعد</div>
        )}
      </div>

      {hasContent && (
        <div className="card-body">
          {hasExamFormat && (
            <div className="important-badge">
              <div className="badge-line">
                <span className="badge-label">شكل الامتحان:</span> {subject.examFormat}
              </div>
            </div>
          )}

          {hasCurriculum && (
            <>
              <span className="section-tag">المقرر</span>
              <NumberedTextBox text={subject.curriculum} variant="curriculum" />
            </>
          )}

          {subject.cancelled.trim() && (
            <div className="cancel-badge">
              <span className="badge-label">⚠️ الملغي:</span> {subject.cancelled}
            </div>
          )}

          {hasProgress && (
            <>
              <span className="section-tag">وصلنا لحد فين</span>
              <NumberedTextBox text={subject.progress} variant="progress" />
            </>
          )}

          {groups.map((group) => (
            <section key={group.id}>
              <span className="section-tag">{group.title || 'الأسئلة المحددة'}</span>
              {group.items.map((item, index) => (
                <div className="q-row" key={item.id}>
                  <div className="q-num">{index + 1}</div>
                  <div>{item.text}</div>
                </div>
              ))}
            </section>
          ))}
        </div>
      )}

      {subject.bookUrl && (
        <div className="card-body" style={{ paddingTop: hasContent ? 0 : 24 }}>
          <a
            className="telegram-btn"
            href={subject.bookUrl}
            target="_blank"
            rel="noopener noreferrer"
          >
            📖 الكتاب
          </a>
        </div>
      )}
    </article>
  );
}
