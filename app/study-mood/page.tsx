import Link from 'next/link';
import { toPublicSubjects } from '@/lib/normalize';
import { getSite } from '@/lib/store';
import StudyMood from '@/components/StudyMood';
export const dynamic = 'force-dynamic';
export const revalidate = 0;
export default async function StudyMoodPage() {
  const site = await getSite();
  const subjects = toPublicSubjects(site.subjects);
  return (
    <>
      <header className="study-mood-header">
        <div className="main-title">Study Mood</div>
        <Link className="study-mood-back" href="/">العودة لجدول الامتحانات</Link>
      </header>
      <StudyMood subjects={subjects} />
    </>
  );
}
