export type QuestionItem = {
  id: string;
  text: string;
};

export type QuestionGroup = {
  id: string;
  /** عنوان المجموعة، مثال: "أسئلة هامة جداً" */
  title: string;
  items: QuestionItem[];
};

export type Subject = {
  id: string;
  name: string;
  /**
   * موعد الامتحان بتوقيت القاهرة كوقت محلي (wall time) بالشكل:
   * YYYY-MM-DDTHH:mm  — أو null لو لسه مفيش موعد.
   * التحويل لـ UTC بيحصل على السيرفر عشان كل الزوار يشوفوا نفس العد التنازلي.
   */
  examAt: string | null;
  /** شكل الامتحان */
  examFormat: string;
  /** المقرر */
  curriculum: string;
  /** وصلنا لحد فين */
  progress: string;
  /** الملغي (نص حر) */
  cancelled: string;
  /** لينك الكتاب (تليجرام) */
  bookUrl: string;
  /** مجموعات الأسئلة المحددة */
  groups: QuestionGroup[];
};

export type SiteData = {
  headerTitle: string;
  headerSubtitle: string;
  subjects: Subject[];
  updatedAt: string;
};

/** المادة بعد تجهيزها للعرض في الصفحة العامة */
export type PublicSubject = Subject & {
  /** الموعد محوّل لـ ISO/UTC، أو null */
  examAtIso: string | null;
  /** نص عربي جاهز لعرض الموعد بتوقيت القاهرة */
  examAtLabel: string | null;
};
