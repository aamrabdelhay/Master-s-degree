import type { Metadata } from 'next';
import { isAuthenticated } from '@/lib/auth';
import { isKvConfigured } from '@/lib/kv';
import { getAuth, getSite } from '@/lib/store';
import AdminDashboard from './AdminDashboard';
import AdminLogin from './AdminLogin';
import AdminSetup from './AdminSetup';
import './admin.css';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export const metadata: Metadata = {
  title: 'لوحة التحكم',
  robots: { index: false, follow: false, nocache: true },
};

export default async function AdminPage() {
  const kvReady = isKvConfigured();
  const auth = await getAuth();

  // أول مرة: مفيش كلمة مرور متسجلة
  if (!auth) {
    return <AdminSetup kvReady={kvReady} />;
  }

  // فيه كلمة مرور بس مفيش جلسة صالحة
  if (!(await isAuthenticated(auth.passwordHash))) {
    return <AdminLogin kvReady={kvReady} />;
  }

  const site = await getSite();
  return <AdminDashboard initialSite={site} kvReady={kvReady} />;
}
