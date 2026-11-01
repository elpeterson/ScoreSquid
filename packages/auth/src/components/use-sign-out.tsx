'use client';

import { useRouter } from 'next/navigation';
import { createClient } from '../client';

/** The one way out: every logout control uses this. The proxy handles the redirect. */
export function useSignOut() {
  const router = useRouter();

  return async () => {
    await createClient().auth.signOut();
    router.refresh();
  };
}
