/**
 * Session cookie scope. In production, NEXT_PUBLIC_AUTH_COOKIE_DOMAIN is
 * `.scoresquid.com`, so one sign-in works on every sport's subdomain. Unset, the
 * cookie stays on the current host.
 */
export const authCookieOptions = () => {
  const domain = process.env.NEXT_PUBLIC_AUTH_COOKIE_DOMAIN;
  return domain ? { domain } : {};
};
