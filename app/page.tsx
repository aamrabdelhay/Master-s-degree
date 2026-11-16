import StudentDashboard from '@/components/StudentDashboard';
import { toPublicSubjects } from '@/lib/normalize';
import { getSite } from '@/lib/store';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

function isLatin(text: string): boolean {
  return !/[\u0600-\u06FF]/.test(text);
}

export default async function HomePage() {
  const site = await getSite();
  const subjects = toPublicSubjects(site.subjects);
  return (
    <>
      <div className="bg-legal" aria-hidden="true">⚖</div>
      <header>
        <div className={isLatin(site.headerTitle) ? 'main-title latin' : 'main-title'}>
          {site.headerTitle}
        </div>
      </header>
      <StudentDashboard subjects={subjects} />
    </>
  );
}
