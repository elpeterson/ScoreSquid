export const SPORTS = ['gymnastics', 'archery'] as const;
export type Sport = (typeof SPORTS)[number];

export const ROOT_DOMAIN = 'scoresquid.com';

/** On hosts with no subdomains (localhost, Vercel previews), remembers the chosen sport. */
export const SPORT_COOKIE = 'scoresquid_sport';

export const isSport = (value: unknown): value is Sport =>
  SPORTS.includes(value as Sport);

/** The hostname from a Host header, without the port. */
export const hostnameOf = (host: string | null) => (host ?? '').split(':')[0];

export const isRootDomainHost = (hostname: string) =>
  hostname === ROOT_DOMAIN || hostname.endsWith(`.${ROOT_DOMAIN}`);

/**
 * The sport for a request. The subdomain decides on scoresquid.com, where the
 * cookie is ignored; other hosts have no subdomains to use, so the cookie decides.
 */
export function sportForHost(hostname: string, cookie?: string): Sport | null {
  const label = hostname.split('.')[0];
  if (hostname.split('.').length > 1 && isSport(label)) return label;
  if (isRootDomainHost(hostname)) return null;
  return isSport(cookie) ? cookie : null;
}

/** Where the sport picker sends someone. */
export function sportHref(sport: Sport, hostname: string): string {
  return isRootDomainHost(hostname)
    ? `https://${sport}.${ROOT_DOMAIN}/`
    : `/?sport=${sport}`;
}

/**
 * Where a request with no sport should go, or null to show the picker:
 * /archery/login on scoresquid.com goes to archery.scoresquid.com/login.
 */
export function rootRedirect(pathname: string, hostname: string): string | null {
  if (pathname === '/') return null;
  const [, first, ...rest] = pathname.split('/');
  if (isSport(first) && isRootDomainHost(hostname)) {
    return `https://${first}.${ROOT_DOMAIN}/${rest.join('/')}`;
  }
  return '/';
}

/** Origin for links in auth emails, always from configuration, never the request. */
export function emailOrigin(sport: Sport, env: NodeJS.ProcessEnv = process.env): string {
  if (env.VERCEL_ENV === 'production') return `https://${sport}.${ROOT_DOMAIN}`;
  if (env.VERCEL_ENV === 'preview' && env.VERCEL_URL) return `https://${env.VERCEL_URL}`;
  return env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
}
