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

export default function SubjectCard({ subject }: { subject: PublicSubject }) {
  const now = useNow(1000);
  const target = subject.examAtIso ? new Date(subject.examAtIso).getTime() : null;
  const finished = target !== null && now !== null && target - now <= 0;

  const hasBadge = Boolean(subject.examFormat || subject.curriculum);
  const hasProgress = Boolean(subject.progress.trim());
  const groups = subject.groups.filter((group) => group.items.length > 0);
  const hasContent =
    hasBadge || hasProgress || Boolean(subject.cancelled.trim()) || groups.length > 0;

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
          {hasBadge && (
            <div className="important-badge">
              {subject.examFormat && (
                <div className="badge-line">
                  <span className="badge-label">شكل الامتحان:</span> {subject.examFormat}
                </div>
              )}
              {subject.curriculum && (
                <div className="badge-line">
                  <span className="badge-label">المقرر:</span> {subject.curriculum}
                </div>
              )}
            </div>
          )}

          {subject.cancelled.trim() && (
            <div className="cancel-badge">
              <span className="badge-label">⚠️ الملغي:</span> {subject.cancelled}
            </div>
          )}

          {hasProgress && (
            <>
              <span className="section-tag">وصلنا لحد فين</span>
              <p className="progress-text">{subject.progress}</p>
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
