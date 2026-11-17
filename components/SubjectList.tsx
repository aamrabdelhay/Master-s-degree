'use client';

import { useEffect, useMemo, useState } from 'react';
import type { PublicSubject } from '@/lib/types';
import { sortPublicSubjectsByExam } from '@/lib/subjectOrder';
import SubjectCard from './SubjectCard';

export default function SubjectList({ subjects }: { subjects: PublicSubject[] }) {
  // Start at zero on the server and first client render to keep hydration stable.
  const [now, setNow] = useState(0);

  useEffect(() => {
    const update = () => setNow(Date.now());
    update();
    const interval = window.setInterval(update, 1000);
    return () => window.clearInterval(interval);
  }, []);

  const sortedSubjects = useMemo(
    () => sortPublicSubjectsByExam(subjects, now),
    [subjects, now],
  );

  return (
    <>
      {sortedSubjects.map((subject) => (
        <SubjectCard key={subject.id} subject={subject} />
      ))}
    </>
  );
}
