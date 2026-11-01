const PROBE_ORIGIN = 'https://safe-next.invalid';

/**
 * Return `next` only if it is a same-origin path, else `fallback`.
 *
 * Guards the auth callback against open redirects. Checks by resolving the URL
 * the way the redirect will: `//evil.com`, `/\evil.com` and `/<tab>/evil.com`
 * all resolve off-site, the last because URL parsing strips tabs and newlines.
 * The normalised path is returned, so what was checked is what gets used.
 */
export function safeNextPath(
  next: string | null | undefined,
  fallback = '/dashboard',
): string {
  if (!next || !next.startsWith('/') || next.includes('\\')) return fallback;
  try {
    const url = new URL(next, PROBE_ORIGIN);
    if (url.origin !== PROBE_ORIGIN) return fallback;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return fallback;
  }
}
