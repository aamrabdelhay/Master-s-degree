import type { Metadata, Viewport } from 'next';
import AOSInit from '@/components/AOSInit';
import './globals.css';

export const metadata: Metadata = {
  title: 'دبلومة القانون الخاص — جامعة العاصمة | جدول الامتحانات النهائية',
  description:
    'جدول الامتحانات النهائية لدبلومة القانون الخاص بجامعة العاصمة — المواعيد، شكل الامتحان، المقرر، الأسئلة المحددة، والملغي.',
  applicationName: 'دبلومة القانون الخاص — جامعة العاصمة',
  robots: { index: true, follow: true },
  openGraph: {
    title: 'دبلومة القانون الخاص — جامعة العاصمة',
    description: 'جدول الامتحانات النهائية',
    type: 'website',
    locale: 'ar_EG',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#0f172a',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ar" dir="rtl">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Amiri:wght@400;700&family=Cinzel:wght@700&family=Playfair+Display:ital,wght@1,600&family=Cairo:wght@400;700;900&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        {children}
        <AOSInit />
      </body>
    </html>
  );
}
