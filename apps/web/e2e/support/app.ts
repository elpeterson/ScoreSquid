// Shared end-to-end helpers. Every test gets its own account, made with the local
// stack's admin key and deleted afterwards, so tests run in parallel without sharing
// data. All names and numbers are made up.
import { test as base, expect, type Page } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { assertLocal, MSO_STAND_IN, supabaseEnv } from './env';

export const PASSWORD = 'Throwaway-Pass-1';
const env = supabaseEnv();
assertLocal(env);

export const admin = (): SupabaseClient =>
  createClient(env.url, env.serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });

export type Account = { id: string; email: string; db: SupabaseClient };

export const uniqueEmail = (label: string) =>
  `e2e-${label}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.test`;

export async function createAccount(label = 'user'): Promise<Account> {
  const email = uniqueEmail(label);
  const { data, error } = await admin().auth.admin.createUser({ email, password: PASSWORD, email_confirm: true });
  if (error || !data.user) throw new Error(`Could not create a test account: ${error?.message}`);
  const db = createClient(env.url, env.publishableKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error: signInError } = await db.auth.signInWithPassword({ email, password: PASSWORD });
  if (signInError) throw new Error(`Could not sign the test account in: ${signInError.message}`);
  return { id: data.user.id, email, db };
}

export async function deleteAccount(account: Account) {
  await admin().auth.admin.deleteUser(account.id);
}

/** Picks the sport, as the picker does on hosts without subdomains, then signs in. */
export async function signIn(page: Page, sport: 'archery' | 'gymnastics', email: string) {
  await page.goto(`/?sport=${sport}`);
  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign In with Password' }).click();
  await page.waitForURL(/\/dashboard/);
}

/** The page fits the screen: nothing makes it scroll sideways. */
export async function expectNoSidewaysScroll(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow, 'the page scrolls sideways').toBeLessThanOrEqual(0);
}

/**
 * Marks a test as a known failure on one device until its story is fixed. When the fix
 * lands, Playwright reports the test as unexpectedly passing, so the mark gets removed.
 */
export function knownFailureOn(project: string, story: string) {
  test.fail(test.info().project.name === project, `${story}: known failure on ${project}`);
}

/** Waits for notifications to clear: on a phone they can cover the next control. */
export async function waitForToasts(page: Page) {
  await expect(page.locator('[data-sonner-toast]')).toHaveCount(0, { timeout: 15_000 });
}

/**
 * On a touch screen, every control offers a tap area of at least 40 px each way. Links
 * in running text, and checkboxes, radios and switches (tapped through their labels),
 * are left out.
 */
export async function expectTouchTargets(page: Page) {
  const small = await page.evaluate(() => {
    const controls = document.querySelectorAll(
      'button:not([role="checkbox"]):not([role="switch"]):not([role="radio"]), [role="tab"], [role="combobox"], a.inline-flex, header a, select, input:not([type="checkbox"]):not([type="radio"]):not([type="hidden"]):not([type="file"])',
    );
    return Array.from(controls)
      .filter((el) => {
        const box = el.getBoundingClientRect();
        if (box.width === 0 || box.height === 0) return false;
        return box.width < 40 || box.height < 40;
      })
      .map((el) => `${el.tagName.toLowerCase()} "${((el as HTMLElement).innerText || el.getAttribute('aria-label') || '').trim().slice(0, 30)}"`);
  });
  expect(small, 'controls with a tap area under 40 px').toEqual([]);
}

type MsoRequest = { path: string; gymnastid?: string };

/**
 * How many requests the MSO stand-in has had for one athlete: by Athlete ID in the
 * JSON query or in the page path. Tests run in parallel, so a total would count
 * other tests' requests too.
 */
export async function msoRequestCount(athleteId: string): Promise<number> {
  const res = await fetch(`${MSO_STAND_IN}/__requests`);
  const { requests } = (await res.json()) as { requests: MsoRequest[] };
  return requests.filter((r) => r.gymnastid === athleteId || new RegExp(`/${athleteId}(?:[/?#]|$)`).test(r.path))
    .length;
}

/** A test with a fresh, signed-out account that is removed afterwards. */
export const test = base.extend<{ account: Account }>({
  account: async ({}, provide, testInfo) => {
    const account = await createAccount(testInfo.project.name);
    await provide(account);
    await deleteAccount(account);
  },
});

export { expect };
