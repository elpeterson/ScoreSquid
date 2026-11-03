import { expect, expectNoSidewaysScroll, msoRequestCount, signIn, test, waitForToasts } from './support/app';
import { addGymnast, addMeet } from './support/seed';

// The MSO stand-in serves the made-up unit-test fixtures for Athlete ID 1001.
const MSO_ID = '1001';

test('a parent adds a gymnast @phone', async ({ page, account }) => {
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

  const before = await msoRequestCount(MSO_ID);
  await page.goto('/import');
  await expect(page.getByLabel('Athlete ID')).toHaveValue(MSO_ID);
  await page.reload();
  await expect(page.getByText(/Found \d+ meets/)).toHaveCount(0);
  expect(await msoRequestCount(MSO_ID), 'opening Import must not read MSO').toBe(before);

  await page.getByRole('button', { name: 'Sync Meets' }).click();
  await expect(page.getByText('Example Invitational')).toBeVisible();
  expect(await msoRequestCount(MSO_ID)).toBeGreaterThan(before);

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

test("a women's meet keeps its MSO ID, so it re-imports, and an older import is linked (SQ-048)", async ({ page, account }) => {
  // The stand-in's made-up women's athlete page links to /results/<meet>/5550001.
  const gymnast = await addGymnast(account, 'Riley Madeup', 'WAG', '5550001');
  // Imported before the fix: same name as MSO's meet 90002, but no MSO ID.
  const older = await addMeet(account, gymnast, { name: 'Made-Up Penny Invitational 2025', date: '2025-01-10' }, { vault: 9.1 });
  await signIn(page, 'gymnastics', account.email);

  await page.goto('/import');
  await page.getByRole('button', { name: 'Sync Meets' }).click();
  const meet = page.locator('div.border.rounded-lg', { hasText: '2026 Sample Snowflake Classic' });
  await expect(meet).toBeVisible();

  const { data: linked } = await account.db.from('gym_competitions').select('mso_meet_id').eq('id', older).single();
  expect(linked!.mso_meet_id, 'the older import is given its MSO ID on sync').toBe('90002');

  await meet.getByRole('button', { name: /^Import/ }).click();
  await expect(meet.getByText('Imported')).toBeVisible();
  const { data: imported } = await account.db
    .from('gym_competitions')
    .select('id, mso_meet_id, level, division, start_date, all_around_place, scores:gym_scores(apparatus, value)')
    .eq('name', '2026 Sample Snowflake Classic')
    .single();
  expect(imported!.mso_meet_id).toBe('90001');
  // Just the level: the list cell's age group and screen-reader label are dropped (SQ-049).
  expect(imported!.level).toBe('6');
  expect(imported!.division).toBeNull();
  expect(imported!.start_date).toBe('2026-02-13');
  expect(imported!.all_around_place).toBe(4);
  expect(Object.fromEntries(imported!.scores.map((s) => [s.apparatus, s.value]))).toEqual({
    vault: 8.95,
    uneven_bars: 8.875,
    balance_beam: 9,
    floor_exercise: 9.3,
  });

  // The parent changes a score; re-import reads the athlete's own page and offers it back.
  const { error } = await account.db.from('gym_scores').update({ value: 1.5 }).eq('competition_id', imported!.id).eq('apparatus', 'balance_beam');
  expect(error).toBeNull();
  await waitForToasts(page);
  await meet.getByRole('button', { name: 'Re-import' }).click();
  await expect(page.getByRole('dialog')).toContainText('Beam score');
  await expect(page.getByRole('dialog')).toContainText('9');
});

test("a hand-entered women's meet fills from MSO, and a wrong suggestion is remembered (SQ-048)", async ({ page, account }) => {
  const gymnast = await addGymnast(account, 'Riley Madeup', 'WAG', '5550001');
  // Similar names, so each is suggested for one MSO meet. Neither has an MSO ID.
  const live = await addMeet(account, gymnast, { name: 'Snowflake Classic', date: '2026-02-13' }, { vault: 8.95 });
  const other = await addMeet(account, gymnast, { name: 'Made-Up Penny Invitational', date: '2024-11-02' }, { vault: 9 });
  await signIn(page, 'gymnastics', account.email);

  await page.goto('/import');
  await page.getByRole('button', { name: 'Sync Meets' }).click();

  const penny = page.locator('div.border.rounded-lg', { hasText: 'Made-Up Penny Invitational 2025' });
  await penny.getByRole('button', { name: 'Not the same meet' }).click();
  await expect(penny.getByRole('button', { name: 'Not the same meet' })).toHaveCount(0);
  const { data: rejected } = await account.db.from('gym_competitions').select('rejected_mso_meet_ids').eq('id', other).single();
  expect(rejected!.rejected_mso_meet_ids).toEqual(['90002']);

  const snowflake = page.locator('div.border.rounded-lg', { hasText: '2026 Sample Snowflake Classic' });
  await snowflake.getByRole('button', { name: 'Review and fill' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText('Beam score');
  await dialog.getByRole('button', { name: /^Link and update/ }).click();
  await expect(snowflake.getByText('Imported')).toBeVisible();

  const { data: filled } = await account.db
    .from('gym_competitions')
    .select('mso_meet_id, scores:gym_scores(apparatus, value)')
    .eq('id', live)
    .single();
  expect(filled!.mso_meet_id).toBe('90001');
  expect(Object.fromEntries(filled!.scores.map((s) => [s.apparatus, s.value]))).toEqual({
    vault: 8.95,
    uneven_bars: 8.875,
    balance_beam: 9,
    floor_exercise: 9.3,
  });
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
