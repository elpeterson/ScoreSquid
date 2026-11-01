'use client';

import { useSignOut } from './use-sign-out';

export function LogoutButton() {
  const signOut = useSignOut();

  return (
    <button
      onClick={signOut}
      className="text-sm font-semibold leading-6 hover:text-secondary transition-colors"
    >
      Log out <span aria-hidden="true">&rarr;</span>
    </button>
  );
}
