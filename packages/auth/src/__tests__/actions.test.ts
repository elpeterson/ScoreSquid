// The shared auth actions become public endpoints once an app wraps them, so they must
// check their input and write only the signed-in user's settings (SQ-046).
import { beforeEach, describe, expect, it, vi } from 'vitest';

type Call = { table: string; op: string; values?: unknown; filters: [string, unknown][] };
const h = vi.hoisted(() => ({
  user: { id: 'user-1' } as { id: string } | null,
  calls: [] as Call[],
  authCalls: [] as string[],
  authError: null as { message: string } | null,
  row: null as unknown,
}));

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('next/navigation', () => ({
  redirect: (to: string) => {
    throw new Error(`NEXT_REDIRECT ${to}`);
  },
}));
vi.mock('../server', () => ({
  createClient: async () => {
    const auth = (name: string) => async () => {
      h.authCalls.push(name);
      return { error: h.authError };
    };
    return {
      auth: {
        getUser: async () => ({ data: { user: h.user } }),
        signInWithPassword: auth('signIn'),
        signUp: auth('signUp'),
        resetPasswordForEmail: auth('reset'),
        updateUser: auth('updateUser'),
      },
      from: (table: string) => {
        const call: Call = { table, op: 'select', filters: [] };
        h.calls.push(call);
        const chain = {
          select: () => chain,
          eq: (col: string, v: unknown) => (call.filters.push([col, v]), chain),
          single: async () => ({ data: h.row }),
          upsert: async (values: unknown) => {
            call.op = 'upsert';
            call.values = values;
            return { error: null };
          },
        };
        return chain;
      },
    };
  },
}));

import { changePassword, readUserSettings, signIn, writeUserSetting } from '../actions';

const form = (fields: Record<string, string>) => {
  const data = new FormData();
  for (const [k, v] of Object.entries(fields)) data.set(k, v);
  return data;
};

beforeEach(() => {
  h.user = { id: 'user-1' };
  h.calls = [];
  h.authCalls = [];
  h.authError = null;
  h.row = null;
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://127.0.0.1:54321';
});

describe('signIn', () => {
  it('reports a failed sign-in without redirecting', async () => {
    h.authError = { message: 'Invalid login credentials' };
    expect(await signIn(form({ email: 'a@example.test', password: 'x' }))).toEqual({ error: 'Invalid login credentials' });
  });

  it('redirects to the dashboard once signed in', async () => {
    await expect(signIn(form({ email: 'a@example.test', password: 'right' }))).rejects.toThrow('NEXT_REDIRECT /dashboard');
  });
});

describe('changePassword', () => {
  it('refuses passwords that differ or are too short, without calling Supabase', async () => {
    expect(await changePassword(form({ password: 'abcdef', confirm_password: 'abcdeg' }))).toEqual({
      error: 'Passwords do not match',
    });
    expect((await changePassword(form({ password: 'abc', confirm_password: 'abc' }))).error).toMatch(/at least 6/);
    expect(h.authCalls).toEqual([]);
  });

  it('changes a valid password', async () => {
    expect(await changePassword(form({ password: 'abcdef', confirm_password: 'abcdef' }))).toEqual({ success: true });
    expect(h.authCalls).toEqual(['updateUser']);
  });
});

describe('readUserSettings', () => {
  const defaults = { theme: 'system' };

  it('gives the defaults when signed out, or with no Supabase configured', async () => {
    h.user = null;
    expect(await readUserSettings(defaults)).toEqual(defaults);
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    h.user = { id: 'user-1' };
    expect(await readUserSettings(defaults)).toEqual(defaults);
    expect(h.calls).toEqual([]);
  });

  it("reads only the user's own row", async () => {
    h.row = { theme: 'dark' };
    expect(await readUserSettings(defaults)).toEqual({ theme: 'dark' });
    expect(h.calls).toEqual([{ table: 'user_settings', op: 'select', filters: [['user_id', 'user-1']] }]);
  });
});

describe('writeUserSetting', () => {
  const defaults = { theme: 'system', show_placements: true };

  it('needs a user', async () => {
    h.user = null;
    expect(await writeUserSetting('theme', 'dark', defaults)).toEqual({ error: 'Not authenticated' });
    expect(h.calls).toEqual([]);
  });

  it('refuses a key or value outside the defaults', async () => {
    expect(await writeUserSetting('is_admin', true, defaults)).toEqual({ error: 'Invalid setting' });
    expect(await writeUserSetting('show_placements', 'yes', defaults)).toEqual({ error: 'Invalid setting' });
    expect(h.calls).toEqual([]);
  });

  it("writes the user's own row, whatever the request says", async () => {
    expect(await writeUserSetting('theme', 'dark', defaults, 'gym_settings')).toEqual({ success: true });
    expect(h.calls[0]).toMatchObject({ table: 'gym_settings', op: 'upsert', values: { theme: 'dark', user_id: 'user-1' } });
  });
});
