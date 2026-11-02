import { type NextRequest, NextResponse } from 'next/server';
import { createAuthProxy } from '@scoresquid/auth/proxy';
import { hostnameOf, isRootDomainHost, isSport, rootRedirect, SPORT_COOKIE, sportForHost, type Sport } from '@/lib/sport';

const sportProxies: Record<Sport, ReturnType<typeof createAuthProxy>> = {
  gymnastics: createAuthProxy({ rewritePrefix: '/gymnastics' }),
  archery: createAuthProxy({
    rewritePrefix: '/archery',
    // Public pages: no session needed (the archer POC is lookup-by-number only).
    publicPrefixes: ['/archer'],
  }),
};

export async function proxy(request: NextRequest) {
  const { pathname, searchParams } = request.nextUrl;
  // The Host header, because nextUrl.hostname can be the server's own address.
  const hostname = hostnameOf(request.headers.get('host'));

  // Hosts without subdomains choose a sport with ?sport= (localhost, previews).
  const chosen = searchParams.get('sport');
  if (isSport(chosen) && !isRootDomainHost(hostname)) {
    const response = NextResponse.redirect(new URL('/', request.url));
    response.cookies.set(SPORT_COOKIE, chosen, { path: '/', sameSite: 'lax' });
    return response;
  }

  const sport = sportForHost(hostname, request.cookies.get(SPORT_COOKIE)?.value);
  if (sport) return sportProxies[sport](request);

  const target = rootRedirect(pathname, hostname);
  return target ? NextResponse.redirect(new URL(target, request.url)) : NextResponse.next();
}

export const config = {
  matcher: [
    // Only real files skip the proxy. Excluding by extension would let /archery/archer/1.png
    // reach an internal route directly, on any host.
    '/((?!_next/static|_next/image|_vercel/|favicon\\.ico$|icon\\.svg$).*)',
  ],
};
