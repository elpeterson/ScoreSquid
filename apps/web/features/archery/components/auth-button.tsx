import { createClient } from '@scoresquid/auth/server';
import { LogoutButton } from '@scoresquid/auth/components/logout-button';
import Link from 'next/link';

export async function AuthButton() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return user ? (
    <LogoutButton />
  ) : (
    <Link
      href="/login"
      className="whitespace-nowrap text-sm font-semibold leading-6 hover:text-primary"
    >
      Log in <span aria-hidden="true">&rarr;</span>
    </Link>
  );
}
