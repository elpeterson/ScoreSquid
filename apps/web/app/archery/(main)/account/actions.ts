'use server';

import { changePassword } from '@scoresquid/auth/actions';

export async function updatePassword(formData: FormData) {
  return changePassword(formData);
}
