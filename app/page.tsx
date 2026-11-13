import SubjectCard from '@/components/SubjectCard';
import { toPublicSubjects } from '@/lib/normalize';
import { getSite } from '@/lib/store';

// الصفحة بتقرأ من قاعدة البيانات في كل زيارة، عشان أي تعديل من الأدمن يظهر فوراً
export const dynamic = 'force-dynamic';
export const revalidate = 0;

/** هل النص إنجليزي (من غير أي حروف عربية)؟ */
function isLatin(text: string): boolean {
  return !/[\u0600-\u06FF]/.test(text);
}

export default async function HomePage() {
  const site = await getSite();
  const subjects = toPublicSubjects(site.subjects);

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

    </>
  );
}
