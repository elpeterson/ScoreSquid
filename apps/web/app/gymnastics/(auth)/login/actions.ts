'use server';

import { requestPasswordReset, signIn, signUp } from '@scoresquid/auth/actions';
import { emailOrigin } from '@/lib/sport';

export async function login(formData: FormData) {
  return signIn(formData);
}

export async function signup(formData: FormData) {
  return signUp(formData, emailOrigin('gymnastics'));
}

export async function resetPassword(formData: FormData) {
  return requestPasswordReset(formData, emailOrigin('gymnastics'));
}
