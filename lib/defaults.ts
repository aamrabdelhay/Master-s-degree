import type { QuestionGroup, SiteData, Subject } from './types';

export const DEFAULT_BOOK_URL = 'https://t.me/+R2FwAGsyjiBhYThk';

export const DEFAULT_HEADER_TITLE = 'دبلومة القانون الخاص — جامعة العاصمة';
export const DEFAULT_HEADER_SUBTITLE = '';

/** ترتيب الموضوعات التي تم شرحها في مادة التنفيذ/المرافعات. */
export const DEFAULT_EXECUTION_GROUPS: QuestionGroup[] = [
  {
    id: 'execution-covered-topics',
    title: 'الموضوعات التي تم شرحها',
    items: [
      'السلطة التقديرية لقاضي التنفيذ',
      'التظلم من قرارات إدارة التنفيذ',
      'خروج بعض المنازعات عن اختصاص إدارة التنفيذ',
      'العلاقة بين الأولوية الإجرائية والموضوعية',
      'التكييف القانوني للإيداع والتخصيص',
      'مقارنة وقف التنفيذ من قاضي التنفيذ والنقض',
      'التكييف القانوني للحجز التحفظي',
      'الإشكال المعكوس والعكسي',
      'مقارنة الاختلافات بين التنفيذ على العقار وفقًا للتمويل العقاري والقواعد العامة',
      'تزاحم وأولويات السندات التنفيذية',
      'دعوى رفع الحجز وعدم الاعتداد بالحجز',
      'الدعوى',
      'إجراءات رفع الدعوى',
      'الطعن',
      'المنازعة الموضوعية',
      'وقف التنفيذ',
      'التحوير',
      'احترام حق الدفاع',
      'الشطب',
      'الإشكال الأول × دعوى الاسترداد',
    ].map((text, index) => ({
      id: index < 11 ? `execution-topic-${index + 1}` : `timely-execution-topic-${index - 10}`,
      text,
    })),
  },
];;

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
    groups:
      index === 0
        ? DEFAULT_EXECUTION_GROUPS.map((group) => ({
            ...group,
            items: group.items.map((item) => ({ ...item })),
          }))
        : [],
  }));
}

export function createDefaultSite(): SiteData {
  return {
    headerTitle: DEFAULT_HEADER_TITLE,
    headerSubtitle: DEFAULT_HEADER_SUBTITLE,
    subjects: createDefaultSubjects(),
    migrations: [],
    updatedAt: new Date().toISOString(),
  };
}
