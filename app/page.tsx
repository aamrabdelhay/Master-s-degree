import SubjectCard from '@/components/SubjectCard';
import { CAIRO_TZ } from '@/lib/cairo';
import { toPublicSubjects } from '@/lib/normalize';
import { getSite } from '@/lib/store';

// الصفحة بتقرأ من قاعدة البيانات في كل زيارة، عشان أي تعديل من الأدمن يظهر فوراً
export const dynamic = 'force-dynamic';
export const revalidate = 0;

const updatedAtFormatter = new Intl.DateTimeFormat('ar-EG-u-nu-latn', {
  timeZone: CAIRO_TZ,
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hour12: true,
});

function formatUpdatedAt(iso: string): string | null {
  try {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return null;
    return updatedAtFormatter.format(date);
  } catch {
    return null;
  }
}

/** هل النص إنجليزي (من غير أي حروف عربية)؟ */
function isLatin(text: string): boolean {
  return !/[\u0600-\u06FF]/.test(text);
}

export default async function HomePage() {
  const site = await getSite();
  const subjects = toPublicSubjects(site.subjects);
  const updatedAt = formatUpdatedAt(site.updatedAt);

  return (
    <>
      <div className="bg-legal" aria-hidden="true">
        ⚖
      </div>

      <header>
        <div className={`main-title${isLatin(site.headerTitle) ? ' latin' : ''}`}>
          {site.headerTitle}
        </div>
        <div className={`sub-title${isLatin(site.headerSubtitle) ? ' latin' : ''}`}>
          {site.headerSubtitle}
        </div>
      </header>

      <main className="container">
        {subjects.length === 0 ? (
          <div className="subject-card" data-aos="fade-up">
            <div className="card-body" style={{ textAlign: 'center', color: '#475569' }}>
              لسه مفيش مواد مضافة. جاري تجهيز الجدول…
            </div>
          </div>
        ) : (
          subjects.map((subject) => <SubjectCard key={subject.id} subject={subject} />)
        )}
      </main>

      {updatedAt && (
        <footer className="site-footer">
          آخر تحديث للجدول <span className="dot">•</span> {updatedAt}{' '}
          <span className="dot">•</span> بتوقيت القاهرة
        </footer>
      )}
    </>
  );
}
