/** Codes the auth callback may put in `/login?error=`. */
export const LOGIN_ERROR = {
  linkFailed: 'link_failed',
  linkInvalid: 'link_invalid',
} as const;

const MESSAGES: Record<string, string> = {
  [LOGIN_ERROR.linkFailed]:
    'That link has expired or was already used. Please request a new one.',
  [LOGIN_ERROR.linkInvalid]:
    'That link is not valid. Please request a new one.',
};

/**
 * Text to show for a `?error=` value, or null. Only known codes produce text,
 * so a crafted link can't put its own words on the login page.
 */
export function loginErrorMessage(code: unknown): string | null {
  if (typeof code !== 'string' || !Object.hasOwn(MESSAGES, code)) return null;
  return MESSAGES[code];
}
