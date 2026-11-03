import { expect, expectNoSidewaysScroll, knownFailureOn, msoRequestCount, signIn, test, waitForToasts } from './support/app';
import { addGymnast, addMeet } from './support/seed';

// The MSO stand-in serves the made-up unit-test fixtures for Athlete ID 1001.
const MSO_ID = '1001';

test('a parent adds a gymnast @phone', async ({ page, account }) => {
  // The dashboard's title and buttons don't wrap at 393 px, so the page scrolls 79 px sideways.
  knownFailureOn('iphone', 'SQ-043');
  await signIn(page, 'gymnastics', account.email);
  await page.getByRole('combobox').first().click();
  await page.getByText(/Add Gymnast/i).first().click();
  await page.getByLabel('Gymnast Name').fill('Sam Madeup');
  await page.getByRole('button', { name: 'Create Profile' }).click();
  await expect(page.getByRole('combobox').first()).toContainText('Sam Madeup');
  await expectNoSidewaysScroll(page);
});

test('MSO is read only on request, then a meet imports and re-imports (SQ-039) @phone', async ({ page, account }) => {
  await addGymnast(account, 'Sam Madeup', 'MAG', MSO_ID);
  await signIn(page, 'gymnastics', account.email);

  const before = await msoRequestCount();
  await page.goto('/import');
  await expect(page.getByLabel('Athlete ID')).toHaveValue(MSO_ID);
  await page.reload();
  await expect(page.getByText(/Found \d+ meets/)).toHaveCount(0);
  expect(await msoRequestCount(), 'opening Import must not read MSO').toBe(before);

  await page.getByRole('button', { name: 'Sync Meets' }).click();
  await expect(page.getByText('Example Invitational')).toBeVisible();
  expect(await msoRequestCount()).toBeGreaterThan(before);

  const meet = page.locator('div.border.rounded-lg', { hasText: 'Example Invitational' });
  await meet.getByRole('button', { name: /^Import/ }).click();
  await expect(meet.getByText('Imported')).toBeVisible();
  await expectNoSidewaysScroll(page);

  // The parent changes a score, so MSO now differs and re-import offers it back.
  const { data: competition } = await account.db.from('gym_competitions').select('id').eq('name', 'Example Invitational').single();
  const { error } = await account.db.from('gym_scores').update({ value: 1.5 }).eq('competition_id', competition!.id).eq('apparatus', 'floor_exercise');
  expect(error).toBeNull();
  await waitForToasts(page);
  await meet.getByRole('button', { name: 'Re-import' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByRole('dialog')).toContainText(/Floor/i);
});

test('a parent sees Insights and deletes a meet', async ({ page, account }) => {
  const gymnast = await addGymnast(account, 'Sam Madeup', 'MAG', MSO_ID);
  await addMeet(account, gymnast, { name: 'Made Up Meet A', date: '2025-01-10', level: '4', division: '1' }, { floor_exercise: 12.1, vault: 12.4 });
  await addMeet(account, gymnast, { name: 'Made Up Meet B', date: '2025-02-14', level: '4', division: '1' }, { floor_exercise: 12.6, vault: 12.2 });
  await signIn(page, 'gymnastics', account.email);
  await page.goto('/insights');
  await expect(page.locator('.recharts-surface').first()).toBeVisible();

  await page.goto('/dashboard');
  await page.getByRole('button', { name: 'Open menu' }).first().click();
  await page.getByRole('menuitem', { name: /delete/i }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: /delete/i }).click();
  await expect(page.getByText(/Made Up Meet [AB]/)).toHaveCount(1);
});
