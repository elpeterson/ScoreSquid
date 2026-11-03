// The origins ScoreSquid reads from. End-to-end tests point these at local stand-ins,
// so a test never reaches MSO or Between Ends. An override is accepted only for a
// loopback address and never on Vercel (production or preview), so a setting can't send
// a request anywhere else.

export const MSO_ORIGIN = 'https://www.meetscoresonline.com';
export const BE_API_ORIGIN = 'https://resultsapi.herokuapp.com';

const OVERRIDES = {
  [MSO_ORIGIN]: 'E2E_MSO_ORIGIN',
  [BE_API_ORIGIN]: 'E2E_BE_ORIGIN',
} as const;

type Origin = keyof typeof OVERRIDES;

/** A plain http origin on this machine, or null. */
export function loopbackOrigin(value: string | undefined): string | null {
  if (!value) return null;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  const loopback = url.hostname === '127.0.0.1' || url.hostname === 'localhost';
  if (url.protocol !== 'http:' || !loopback || url.pathname !== '/' || url.search || url.username) return null;
  return url.origin;
}

/** Where requests for `origin` go: the real service unless a test stand-in is configured. */
export function outboundOrigin(origin: Origin, env: Record<string, string | undefined> = process.env): string {
  if (env.VERCEL_ENV) return origin;
  return loopbackOrigin(env[OVERRIDES[origin]]) ?? origin;
}
