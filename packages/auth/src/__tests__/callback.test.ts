import { beforeEach, describe, expect, it, vi } from 'vitest';

const auth = { verifyOtp: vi.fn(), exchangeCodeForSession: vi.fn() };
vi.mock('../server', () => ({ createClient: async () => ({ auth }) }));

import { GET, RECOVERY_PATH } from '../callback';

const location = async (query: string) => {
  const response = await GET(new Request(`https://app.example/auth/callback?${query}`));
  return response.headers.get('location');
};

describe('auth callback', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    auth.verifyOtp.mockReset().mockResolvedValue({ error: null });
    auth.exchangeCodeForSession.mockReset().mockResolvedValue({ error: null });
  });

  it('follows a safe next after exchanging a code', async () => {
    expect(await location('code=abc&next=/account')).toBe('https://app.example/account');
    expect(auth.exchangeCodeForSession).toHaveBeenCalledWith('abc');
  });

  it('verifies a token hash', async () => {
    expect(await location('token_hash=h&type=signup&next=/account')).toBe('https://app.example/account');
    expect(auth.verifyOtp).toHaveBeenCalledWith({ type: 'signup', token_hash: 'h' });
  });

  it('defaults to the dashboard', async () => {
    expect(await location('code=abc')).toBe('https://app.example/dashboard');
  });

  it.each(['https://evil.example', '//evil.example', '/%5Cevil.example', '/%09/evil.example'])(
    'does not redirect off-site for next=%s',
    async (next) => {
      expect(await location(`code=abc&next=${next}`)).toBe('https://app.example/dashboard');
    },
  );

  it('sends a reset link to the Security tab', async () => {
    const security = `https://app.example${RECOVERY_PATH}`;
    expect(await location('code=abc&next=/account&type=recovery')).toBe(security);
    expect(await location('token_hash=h&type=recovery')).toBe(security);
  });

  it('reports a failed link with a fixed code, not the provider message', async () => {
    auth.exchangeCodeForSession.mockResolvedValue({ error: { message: 'secret detail' } });
    expect(await location('code=abc')).toBe('https://app.example/login?error=link_failed');
    auth.verifyOtp.mockResolvedValue({ error: { message: 'secret detail' } });
    expect(await location('token_hash=h&type=signup')).toBe('https://app.example/login?error=link_failed');
  });

  it('reports a link with no credentials', async () => {
    expect(await location('next=/account')).toBe('https://app.example/login?error=link_invalid');
    expect(await location('token_hash=h')).toBe('https://app.example/login?error=link_invalid');
    expect(auth.verifyOtp).not.toHaveBeenCalled();
    expect(auth.exchangeCodeForSession).not.toHaveBeenCalled();
  });
});
