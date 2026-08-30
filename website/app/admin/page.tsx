import { redirect } from 'next/navigation';
import { isAdminAuthenticated } from '@/lib/admin/auth';
import { AdminDashboard } from '@/components/admin/AdminDashboard';

export default async function AdminPage() {
  if (!(await isAdminAuthenticated())) {
    redirect('/admin/login');
  }

  return <AdminDashboard />;
}
