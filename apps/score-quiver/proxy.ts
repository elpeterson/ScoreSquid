import { createAuthProxy } from '@scoresquid/auth/proxy';

export const proxy = createAuthProxy({
  // Public pages: no session needed (the archer POC is lookup-by-number only).
  publicPrefixes: ['/archer'],
});

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
