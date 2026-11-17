export type HasExamTime = { examAtIso: string | null };

/**
 * Keep upcoming exams first, undated subjects next, and finished exams last.
 * A caller can pass a clock value so the ordering is deterministic in tests.
 */
export function sortPublicSubjectsByExam<T extends HasExamTime>(
  subjects: T[],
  now = Date.now(),
): T[] {
  const upcoming: Array<{ subject: T; time: number; index: number }> = [];
  const undated: T[] = [];
  const finished: Array<{ subject: T; time: number; index: number }> = [];

  subjects.forEach((subject, index) => {
    if (!subject.examAtIso) {
      undated.push(subject);
      return;
    }

    const time = new Date(subject.examAtIso).getTime();
    if (!Number.isFinite(time)) {
      undated.push(subject);
    } else if (time <= now) {
      finished.push({ subject, time, index });
    } else {
      upcoming.push({ subject, time, index });
    }
  });

  upcoming.sort((a, b) => a.time - b.time || a.index - b.index);
  finished.sort((a, b) => b.time - a.time || a.index - b.index);

  return [
    ...upcoming.map((entry) => entry.subject),
    ...undated,
    ...finished.map((entry) => entry.subject),
  ];
}
