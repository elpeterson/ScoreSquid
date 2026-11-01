import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

type CookieAdapter = {
  setAll: (cookies: { name: string; value: string; options: object }[]) => void;
};

let user: { id: string } | null = null;
let refreshedCookie: string | null = null;
const createServerClient = vi.fn((_url: string, _key: string, { cookies }: { cookies: CookieAdapter }) => ({
  auth: {
    getUser: async () => {
      if (refreshedCookie) {
        cookies.setAll([{ name: 'sb-token', value: refreshedCookie, options: {} }]);
      }
      return { data: { user } };
    },
  },
}));
vi.mock('@supabase/ssr', () => ({
  createServerClient: (url: string, key: string, options: { cookies: CookieAdapter }) =>
    createServerClient(url, key, options),
}));

import { createAuthProxy } from '../proxy';

const proxy = createAuthProxy({ publicPrefixes: ['/archer'] });
const visit = (path: string) => proxy(new NextRequest(`https://app.example${path}`));
const redirectOf = (response: Response) => response.headers.get('location');

describe('createAuthProxy', () => {
  beforeEach(() => {
    user = null;
    refreshedCookie = null;
    createServerClient.mockClear();
  });

  it('sends signed-out visitors to /login', async () => {
    expect(redirectOf(await visit('/dashboard'))).toBe('https://app.example/login');
    expect(redirectOf(await visit('/'))).toBe('https://app.example/login');
  });

  it('lets signed-out visitors reach the auth pages', async () => {
    expect(redirectOf(await visit('/login'))).toBeNull();
    expect(redirectOf(await visit('/login?error=link_failed'))).toBeNull();
    expect(redirectOf(await visit('/auth/callback?code=x'))).toBeNull();
  });

  it('does not treat lookalike paths as auth pages', async () => {
    expect(redirectOf(await visit('/loginx'))).toBe('https://app.example/login');
    expect(redirectOf(await visit('/authors'))).toBe('https://app.example/login');
  });

  it('sends signed-in visitors from /login to the dashboard', async () => {
    user = { id: 'u1' };
    expect(redirectOf(await visit('/login'))).toBe('https://app.example/dashboard');
    expect(redirectOf(await visit('/dashboard'))).toBeNull();
  });

  it('serves public prefixes without touching Supabase', async () => {
    expect(redirectOf(await visit('/archer'))).toBeNull();
    expect(redirectOf(await visit('/archer/123'))).toBeNull();
    expect(createServerClient).not.toHaveBeenCalled();
  });

  it('does not treat lookalikes of a public prefix as public', async () => {
    expect(redirectOf(await visit('/archery'))).toBe('https://app.example/login');
  });

  it('has no public pages unless given some', async () => {
    const strict = createAuthProxy();
    const response = await strict(new NextRequest('https://app.example/archer'));
    expect(redirectOf(response)).toBe('https://app.example/login');
  });

  it('keeps refreshed session cookies on pass-through and on redirects', async () => {
    user = { id: 'u1' };
    refreshedCookie = 'rotated';
    expect((await visit('/dashboard')).cookies.get('sb-token')?.value).toBe('rotated');
    expect((await visit('/login')).cookies.get('sb-token')?.value).toBe('rotated');
  });
});
