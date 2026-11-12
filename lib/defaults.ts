import type { SiteData, Subject } from './types';

export const DEFAULT_BOOK_URL = 'https://t.me/+R2FwAGsyjiBhYThk';

export const DEFAULT_HEADER_TITLE = 'دبلومة القانون الخاص — جامعة العاصمة';
export const DEFAULT_HEADER_SUBTITLE = 'جدول الامتحانات النهائية';

/** الترتيب الافتراضي للمواد — seed أول مرة */
const DEFAULT_SUBJECT_NAMES = [
  'التنفيذ الجبري',
  'القانون الدولي الخاص',
  'القانون المدني مع التعمق',
  'مناهج البحث',
  'قانون حماية المستهلك',
  'الشريعة الإسلامية',
  'القانون المدني المقارن',
];

function seedId(index: number): string {
  return `sub-${index + 1}`;
}

export function createDefaultSubjects(): Subject[] {
  return DEFAULT_SUBJECT_NAMES.map((name, index) => ({
    id: seedId(index),
    name,
    examAt: null,
    examFormat: '',
    curriculum: '',
    progress: '',
    cancelled: '',
    bookUrl: DEFAULT_BOOK_URL,
    groups: [],
  }));
}

export function createDefaultSite(): SiteData {
  return {
    headerTitle: DEFAULT_HEADER_TITLE,
    headerSubtitle: DEFAULT_HEADER_SUBTITLE,
    subjects: createDefaultSubjects(),
    updatedAt: new Date().toISOString(),
  };
}
