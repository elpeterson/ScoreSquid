'use server';

import { requestPasswordReset, signIn, signUp } from '@scoresquid/auth/actions';

// Used in email links when NEXT_PUBLIC_BASE_URL is not set.
const FALLBACK_ORIGIN = 'https://gymnastshoebox.elpeterson.com';

export async function login(formData: FormData) {
  return signIn(formData);
}

export async function signup(formData: FormData) {
  return signUp(formData, FALLBACK_ORIGIN);
}

export async function resetPassword(formData: FormData) {
  return requestPasswordReset(formData, FALLBACK_ORIGIN);
}
