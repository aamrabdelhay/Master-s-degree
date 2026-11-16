export type StudySubjectInput = {
  id: string;
  name: string;
  examAtIso: string | null;
  remainingTopics: number;
};

export type StudyPlanOptions = {
  restDays: number[];
  includeFriday: boolean;
};

export type StudyPlanItem = {
  subjectId: string;
  subjectName: string;
  kind: 'study' | 'review' | 'final-review';
  topics: number;
};

export type StudyPlanDay = {
  date: string;
  items: StudyPlanItem[];
  isToday: boolean;
  isExamDay: boolean;
};

export type StudyPlanResult = {
  days: StudyPlanDay[];
  undatedSubjects: { id: string; name: string }[];
  examToday: { id: string; name: string }[];
  totalRemainingTopics: number;
  availableStudyDays: number;
  scheduledStudyDays: number;
  insufficientDays: boolean;
  unscheduledSubjects: { id: string; name: string; remainingTopics: number }[];
  reviewConflicts: {
    subjectId: string;
    subjectName: string;
    reviewDate: string;
    conflictsWith: { id: string; name: string }[];
  }[];
};

const DAY_MS = 86_400_000;
const CAIRO_TIME_ZONE = 'Africa/Cairo';

function dateKeyToUtc(dateKey: string): number {
  const parts = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey);
  if (!parts) return Number.NaN;
  return Date.UTC(Number(parts[1]), Number(parts[2]) - 1, Number(parts[3]));
}

function utcToDateKey(timestamp: number): string {
  const date = new Date(timestamp);
  return [
    String(date.getUTCFullYear()).padStart(4, '0'),
    String(date.getUTCMonth() + 1).padStart(2, '0'),
    String(date.getUTCDate()).padStart(2, '0'),
  ].join('-');
}

export function addPlanDays(dateKey: string, amount: number): string {
  return utcToDateKey(dateKeyToUtc(dateKey) + amount * DAY_MS);
}

export function cairoDateKey(value: Date | string): string {
  const date = value instanceof Date ? value : new Date(value);
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: CAIRO_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const fields: Record<string, string> = {};
  for (const part of parts) {
    if (part.type !== 'literal') fields[part.type] = part.value;
  }
  return fields.year + '-' + fields.month + '-' + fields.day;
}

function dayOfWeek(dateKey: string): number {
  return new Date(dateKeyToUtc(dateKey)).getUTCDay();
}

function examDayKey(examAtIso: string): string | null {
  const timestamp = new Date(examAtIso).getTime();
  if (!Number.isFinite(timestamp)) return null;
  return cairoDateKey(new Date(timestamp));
}

/**
 * جدول ثابت قابل للاختبار: المراجعة النهائية تسبق الامتحان بيوم،
 * والتوزيع اليومي يوازن بين عدد الموضوعات وقرب موعد الامتحان.
 */
export function buildStudyPlan(
  today: string,
  subjects: StudySubjectInput[],
  options: StudyPlanOptions,
): StudyPlanResult {
  const todayTimestamp = dateKeyToUtc(today);
  if (!Number.isFinite(todayTimestamp)) {
    throw new Error('today must be a valid YYYY-MM-DD date.');
  }

  const undatedSubjects = subjects
    .filter((subject) => !subject.examAtIso)
    .map(({ id, name }) => ({ id, name }));

  const examEntries = subjects.flatMap((subject) => {
    if (!subject.examAtIso) return [];
    const examDate = examDayKey(subject.examAtIso);
    return examDate ? [{ ...subject, examDate }] : [];
  });
  const examDateSubjects = new Map<string, { id: string; name: string }[]>();
  for (const subject of examEntries) {
    const current = examDateSubjects.get(subject.examDate) || [];
    current.push({ id: subject.id, name: subject.name });
    examDateSubjects.set(subject.examDate, current);
  }
  const examDates = new Set(examDateSubjects.keys());
  const examToday = examEntries
    .filter((subject) => subject.examDate === today)
    .map(({ id, name }) => ({ id, name }));
  const datedSubjects = examEntries
    .filter((subject) => dateKeyToUtc(subject.examDate) > todayTimestamp)
    .map((subject, index) => ({
      ...subject,
      index,
      remainingTopics: Math.max(0, Math.floor(subject.remainingTopics)),
    }));

  const totalRemainingTopics = datedSubjects.reduce(
    (sum, subject) => sum + subject.remainingTopics, 0,
  );
  if (datedSubjects.length === 0) {
    return {
      days: [], undatedSubjects, examToday, totalRemainingTopics,
      availableStudyDays: 0, scheduledStudyDays: 0,
      insufficientDays: false, unscheduledSubjects: [], reviewConflicts: [],
    };
  }

  const lastExamDate = datedSubjects.reduce(
    (latest, subject) => subject.examDate > latest ? subject.examDate : latest,
    datedSubjects[0].examDate,
  );

  const finalReviewDates = new Map<string, typeof datedSubjects>();
  const reviewConflicts: StudyPlanResult['reviewConflicts'] = [];
  for (const subject of datedSubjects) {
    const reviewDate = addPlanDays(subject.examDate, -1);
    if (reviewDate < today) continue;
    if (examDates.has(reviewDate)) {
      reviewConflicts.push({
        subjectId: subject.id,
        subjectName: subject.name,
        reviewDate,
        conflictsWith: examDateSubjects.get(reviewDate) || [],
      });
      continue;
    }
    const current = finalReviewDates.get(reviewDate) || [];
    current.push(subject);
    finalReviewDates.set(reviewDate, current);
  }

  const restDays = new Set(options.restDays.filter(
    (day) => Number.isInteger(day) && day >= 0 && day <= 6,
  ));
  const regularDates: string[] = [];
  for (let date = today; date < lastExamDate; date = addPlanDays(date, 1)) {
    if (examDates.has(date) || finalReviewDates.has(date)) continue;
    const weekday = dayOfWeek(date);
    if ((weekday === 5 && !options.includeFriday) || restDays.has(weekday)) {
      continue;
    }
    regularDates.push(date);
  }

  const assignmentDates = new Map<string, string[]>();
  const assignedCount = new Map<string, number>();
  const assignedToDate = new Map<string, (typeof datedSubjects)[number]>();

  for (const date of regularDates) {
    const candidates = datedSubjects.filter((subject) => subject.examDate > date);
    if (candidates.length === 0) continue;

    candidates.sort((a, b) => {
      const daysA = Math.max(1, (dateKeyToUtc(a.examDate) - dateKeyToUtc(date)) / DAY_MS);
      const daysB = Math.max(1, (dateKeyToUtc(b.examDate) - dateKeyToUtc(date)) / DAY_MS);
      const weightA = Math.max(1, a.remainingTopics);
      const weightB = Math.max(1, b.remainingTopics);
      const scoreA = weightA * (1 + 7 / (daysA + 7)) / (1 + (assignedCount.get(a.id) || 0));
      const scoreB = weightB * (1 + 7 / (daysB + 7)) / (1 + (assignedCount.get(b.id) || 0));
      return scoreB - scoreA || a.examDate.localeCompare(b.examDate) || a.index - b.index;
    });

    const selected = candidates[0];
    const current = assignmentDates.get(selected.id) || [];
    current.push(date);
    assignmentDates.set(selected.id, current);
    assignedCount.set(selected.id, current.length);
    assignedToDate.set(date, selected);
  }

  const plannedItems = new Map<string, StudyPlanItem[]>();
  for (const [subjectId, dates] of assignmentDates) {
    const subject = datedSubjects.find((entry) => entry.id === subjectId);
    if (!subject) continue;
    const total = subject.remainingTopics;
    const baseTopics = dates.length > 0 ? Math.floor(total / dates.length) : 0;
    const remainder = dates.length > 0 ? total % dates.length : 0;
    dates.forEach((date, index) => {
      const topics = total === 0 ? 0 : baseTopics + (index < remainder ? 1 : 0);
      const item: StudyPlanItem = {
        subjectId, subjectName: subject.name,
        kind: topics > 0 ? 'study' : 'review', topics,
      };
      plannedItems.set(date, [item]);
    });
  }

  for (const [date, materials] of finalReviewDates) {
    const current = plannedItems.get(date) || [];
    for (const subject of materials) {
      current.push({
        subjectId: subject.id,
        subjectName: subject.name,
        kind: 'final-review',
        topics: 0,
      });
    }
    plannedItems.set(date, current);
  }

  const allDates = [...plannedItems.keys()].sort();
  const days = allDates.map((date) => ({
    date,
    items: (plannedItems.get(date) || []).sort((a, b) => {
      const subjectA = datedSubjects.find((entry) => entry.id === a.subjectId);
      const subjectB = datedSubjects.find((entry) => entry.id === b.subjectId);
      return (subjectA?.examDate || '').localeCompare(subjectB?.examDate || '');
    }),
    isToday: date === today,
    isExamDay: false,
  }));

  const unscheduledSubjects = datedSubjects
    .filter((subject) => subject.remainingTopics > 0 && !assignmentDates.has(subject.id))
    .map((subject) => ({
      id: subject.id, name: subject.name, remainingTopics: subject.remainingTopics,
    }));

  const scheduledStudyDays = [...assignedToDate.values()].length;
  return {
    days, undatedSubjects, examToday, totalRemainingTopics,
    availableStudyDays: regularDates.length,
    scheduledStudyDays,
    insufficientDays:
      totalRemainingTopics > scheduledStudyDays ||
      unscheduledSubjects.length > 0 ||
      reviewConflicts.length > 0,
    unscheduledSubjects,
    reviewConflicts,
  };
}
