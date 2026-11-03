import { redirect } from 'next/navigation';
import { createClient } from '@scoresquid/auth/server';
import Link from 'next/link';
import { SportLogo } from '@/features/shared/sport-logo';
import { UserNav } from '@scoresquid/auth/components/user-nav';
import { updateSetting } from '@/app/archery/actions/settings';
import { ArcherSwitcher } from '@/features/archery/components/archer-switcher';
import { ensureActiveArcher } from '@/app/archery/actions/archer';
import { SUPPORT_URL } from '@/lib/support';

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

  const { data: archers } = await supabase
    .from('archer_athletes')
    .select('id, name')
    .eq('user_id', user.id)
    .order('created_at', { ascending: true });

  const activeArcherId = await ensureActiveArcher();

  return (
    <div className="min-h-screen bg-background transition-colors duration-300">
      <header className="sticky top-0 z-10 bg-[hsl(158_45%_16%)] border-b border-white/10 shadow-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 grid grid-cols-[1fr_minmax(0,auto)_1fr] items-center gap-3">
          <div className="flex items-center">
            <Link
              href="/dashboard"
              className="inline-flex min-h-11 min-w-11 items-center hover:opacity-80 transition-opacity shrink-0"
            >
              <h1 className="text-xl font-bold text-white tracking-wide cursor-pointer">
                <SportLogo sport="Archery" tone="white" compact />
              </h1>
            </Link>
          </div>

          <div className="flex min-w-0 justify-center">
            <ArcherSwitcher
              archers={archers ?? []}
              activeArcherId={activeArcherId || undefined}
            />
          </div>

          <div className="flex items-center justify-end gap-4 text-white/90">
            <Link
              href="/insights"
              className="text-sm font-medium hover:text-white transition-colors hidden sm:block"
            >
              Insights
            </Link>
            <UserNav email={user.email} updateSetting={updateSetting} supportUrl={SUPPORT_URL} />
          </div>
        </div>
      </header>

      <main className="max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {children}
      </main>
    </div>
  );
}
