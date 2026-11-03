import { redirect } from 'next/navigation';
import { createClient } from '@scoresquid/auth/server';
import Link from 'next/link';
import { SportLogo } from '@/features/shared/sport-logo';
import { UserNav } from '@scoresquid/auth/components/user-nav';
import { updateSetting } from '@/app/gymnastics/actions/settings';
import { GymnastSwitcher } from '@/features/gymnastics/components/gymnast-switcher';
import { ensureActiveGymnast } from '@/app/gymnastics/actions/gymnast';

export default async function MainLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  const { data: gymnasts } = await supabase
    .from('gymnast_athletes')
    .select('id, name')
    .eq('user_id', user.id)
    .order('created_at', { ascending: true });

  const activeGymnastId = await ensureActiveGymnast();

  return (
    <div className="min-h-screen bg-background transition-colors duration-300">
      <header className="sticky top-0 z-10 bg-[#262161] border-b border-white/10 shadow-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-3">
          <div className="flex items-center gap-4 min-w-0">
            <Link
              href="/dashboard"
              className="inline-flex min-h-11 min-w-11 items-center hover:opacity-80 transition-opacity"
            >
              <h1 className="text-xl font-bold text-white tracking-wide cursor-pointer">
                <SportLogo sport="Gymnastics" tone="white" compact />
              </h1>
            </Link>

            {gymnasts && (
              <GymnastSwitcher
                gymnasts={gymnasts}
                activeGymnastId={activeGymnastId || undefined}
              />
            )}
          </div>

          <div className="flex items-center gap-3 shrink-0 text-white/90">
            <Link
              href="/about"
              className="inline-flex min-h-11 items-center text-sm font-medium hover:text-white transition-colors"
            >
              About
            </Link>
            <UserNav email={user.email} updateSetting={updateSetting} />
          </div>
        </div>
      </header>

      <main className="max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {children}
      </main>
    </div>
  );
}
