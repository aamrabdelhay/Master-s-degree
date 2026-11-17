'use client';

import { useEffect, useMemo, useState } from 'react';
import type { PublicSubject } from '@/lib/types';
import SubjectCard from './SubjectCard';

export default function SubjectList({ subjects }: { subjects: PublicSubject[] }) {
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    const update = () => setNow(Date.now());
    update();
    const interval = window.setInterval(update, 1000);
    return () => window.clearInterval(interval);
  }, []);

  const orderedSubjects = useMemo(() => {
    if (now === null) return subjects;

    return subjects
      .map((subject, index) => {
        const examTime = subject.examAtIso ? new Date(subject.examAtIso).getTime() : Number.NaN;
        const group = Number.isFinite(examTime) ? (examTime <= now ? 2 : 0) : 1;
        return { subject, index, examTime, group };
      })
      .sort((a, b) => {
        if (a.group !== b.group) return a.group - b.group;
        if (a.group === 0) return a.examTime - b.examTime || a.index - b.index;
        if (a.group === 2) return b.examTime - a.examTime || a.index - b.index;
        return a.index - b.index;
      })
      .map((entry) => entry.subject);
  }, [subjects, now]);

  return (
    <>
      {orderedSubjects.map((subject) => (
        <SubjectCard key={subject.id} subject={subject} now={now} />
      ))}
    </>
  );
}
