import Link from 'next/link';
export default function StudyMoodLauncher() {
  return (
    <Link href="/study-mood" className="study-mood-launcher" aria-label="افتح Study Mood">
      <svg viewBox="0 0 32 32" width="23" height="23" fill="none" aria-hidden="true">
        <path d="M4.5 7.4c4.2-1.4 8.1-.6 11.5 2.1v16c-3.4-2.7-7.3-3.5-11.5-2.1z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
        <path d="M27.5 7.4C23.3 6 19.4 6.8 16 9.5v16c3.4-2.7 7.3-3.5 11.5-2.1z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
        <path d="M8 11.2c2.2-.4 4.3 0 6.2 1.1M8 15.2c2.2-.4 4.3 0 6.2 1.1M24 11.2c-2.2-.4-4.3 0-6.2 1.1M24 15.2c-2.2-.4-4.3 0-6.2 1.1" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      </svg>
      <span>Study Mood</span>
    </Link>
  );
}
