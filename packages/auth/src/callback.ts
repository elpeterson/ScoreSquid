import { NextResponse } from 'next/server';
import { type EmailOtpType } from '@supabase/supabase-js';
import { LOGIN_ERROR } from './login-errors';
import { safeNextPath } from './redirect';
import { createClient } from './server';

/** Where a password-reset link lands: the form that sets the new password. */
export const RECOVERY_PATH = '/account?tab=security';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const token_hash = searchParams.get('token_hash');
  const type = searchParams.get('type') as EmailOtpType | null;
  const code = searchParams.get('code');
  const next =
    type === 'recovery' ? RECOVERY_PATH : safeNextPath(searchParams.get('next'));

  const toLogin = (error: string) =>
    NextResponse.redirect(new URL(`/login?error=${error}`, request.url));

  if (!code && !(token_hash && type)) return toLogin(LOGIN_ERROR.linkInvalid);

  const supabase = await createClient();
  const { error } =
    token_hash && type
      ? await supabase.auth.verifyOtp({ type, token_hash })
      : await supabase.auth.exchangeCodeForSession(code!);

  if (error) {
    console.error('Auth callback failed:', error.message);
    return toLogin(LOGIN_ERROR.linkFailed);
  }
  return NextResponse.redirect(new URL(next, request.url));
}
