import { type NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';

const AUTH_PREFIXES = ['/login', '/auth'];

const matches = (pathname: string, prefixes: readonly string[]) =>
  prefixes.some((p) => pathname === p || pathname.startsWith(`${p}/`));

export type AuthProxyOptions = {
  /** Pages served without a session or a Supabase call. */
  publicPrefixes?: readonly string[];
};

/**
 * Next's `proxy` for an app: refreshes the session and sends signed-out
 * visitors to /login and signed-in visitors away from it. The `matcher` stays
 * in each app's proxy.ts because Next reads it statically.
 */
export function createAuthProxy({ publicPrefixes = [] }: AuthProxyOptions = {}) {
  return async function proxy(request: NextRequest) {
    const { pathname } = request.nextUrl;
    if (matches(pathname, publicPrefixes)) return NextResponse.next();

    let response = NextResponse.next({ request });

    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
      {
        cookies: {
          getAll() {
            return request.cookies.getAll();
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value }) =>
              request.cookies.set(name, value),
            );
            response = NextResponse.next({ request });
            cookiesToSet.forEach(({ name, value, options }) =>
              response.cookies.set(name, value, options),
            );
          },
        },
      },
    );

    const {
      data: { user },
    } = await supabase.auth.getUser();

    // A redirect must carry any refreshed session cookies, or the rotated
    // token is lost and the visitor is signed out on a later request.
    const redirectTo = (path: string) => {
      const redirect = NextResponse.redirect(new URL(path, request.url));
      response.cookies.getAll().forEach((cookie) => redirect.cookies.set(cookie));
      return redirect;
    };

    if (!user && !matches(pathname, AUTH_PREFIXES)) return redirectTo('/login');
    if (user && matches(pathname, ['/login'])) return redirectTo('/dashboard');

    return response;
  };
}
