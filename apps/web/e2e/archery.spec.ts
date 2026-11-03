import fs from 'node:fs';
import path from 'node:path';
import { expect, expectNoSidewaysScroll, knownFailureOn, signIn, test } from './support/app';
import { scorecardPdf } from './support/pdf';
import { addArcher, arrowTotal, distinctArrows, seedSearch, type Match } from './support/seed';

const match = (i: number, over: Partial<Match> = {}): Match => {
  const arrows = over.arrows ?? distinctArrows(i);
  return {
    event_id: 6000 + i,
    aid: 9000 + i,
    match_kind: 'number',
    tournament_name: `Made Up Open ${i + 1}`,
    tournament_date: new Date(Date.UTC(2024, 0, 6 + i * 12)).toISOString().slice(0, 10),
    total: arrows ? arrowTotal(arrows) : null,
    arrows,
    ...over,
  };
};

test('a parent adds archers and switches between them @phone', async ({ page, account }) => {
  await signIn(page, 'archery', account.email);
  for (const name of ['Robin Madeup', 'Sky Madeup']) {
    // With no archers yet, the dialog opens by itself.
    const dialog = page.getByRole('heading', { name: 'Add Archer Profile' });
    if (!(await dialog.isVisible())) {
      await page.getByRole('combobox').first().click();
      await page.getByText('Add Archer', { exact: true }).click();
    }
    await page.getByLabel('Archer Name').fill(name);
    await page.getByRole('button', { name: 'Create Profile' }).click();
    await expect(page.getByRole('combobox').first()).toContainText(name);
  }
  await page.getByRole('combobox').first().click();
  await page.getByRole('option', { name: 'Robin Madeup' }).click();
  await expect(page.getByRole('combobox').first()).toContainText('Robin Madeup');
  await expectNoSidewaysScroll(page);
});

test('found tournaments import in batches, with repeats shown once (SQ-032, SQ-034) @phone', async ({ page, account }) => {
  const archer = await addArcher(account, 'Pat Madeup');
  const repeated = distinctArrows(500);
  await seedSearch(account, archer, [
    ...Array.from({ length: 30 }, (_, i) => match(i)),
    // One result republished in three Combined roll-ups.
    ...[0, 1, 2].map((k) =>
      match(100 + k, { arrows: repeated, aid: 9999, event_type: 'CombinedRankingEvent', tournament_name: `Made Up Nationals ${k}` }),
    ),
    match(200, { match_kind: 'name', arrows: null, total: 40, tournament_name: 'Made Up Name Match' }),
  ]);

  await signIn(page, 'archery', account.email);
  await page.goto('/import');
  const found = page.locator('section[aria-label="Tournaments found"] li');
  await expect(found).toHaveCount(31);
  await expect(page.getByText('One result, listed 3 times on Between Ends.')).toBeVisible();

  await page.getByRole('button', { name: 'Select none' }).click();
  await expect(page.getByRole('button', { name: /^Import 0 selected$/ })).toBeDisabled();
  await page.getByRole('button', { name: 'Select all' }).click();
  await expect(page.locator('section[aria-label="Possible matches"] input:checked')).toHaveCount(0);
  await page.getByRole('button', { name: 'Import 31 selected' }).click();
  await expect(page.getByText(/^Already imported/)).toHaveCount(31, { timeout: 120_000 });
  await expectNoSidewaysScroll(page);

  await page.goto('/dashboard');
  await expect(page.locator('a[href^="/events/"]')).toHaveCount(31);
  await expect(page.getByText('Some scorecards may be repeats')).toHaveCount(0);
});

test('repeated scorecards saved earlier can be cut down to one (SQ-032)', async ({ page, account }) => {
  const archer = await addArcher(account, 'Pat Madeup');
  for (const name of ['Made Up Nationals', 'Made Up Nationals Final', 'Made Up Nationals Collegiate']) {
    const { error } = await account.db.rpc('import_scorecard', {
      payload: {
        event: {
          athlete_id: archer, name, start_date: '2025-02-22', shot_on: '2025-02-22', environment: 'indoor',
          bow_style: 'compound', distance_m: 18, face_cm: null, arrows_per_end: 3, bonus_labels: [], source: 'manual',
        },
        rounds: [{ round_number: 1, total: 57, bonus: [], ends: [{ end_number: 1, arrows: ['X', '10', '10'] }, { end_number: 2, arrows: ['9', '9', '9'] }] }],
      },
    });
    expect(error).toBeNull();
  }
  await signIn(page, 'archery', account.email);
  await expect(page.getByText('Some scorecards may be repeats')).toBeVisible();
  await page.getByRole('radio', { name: /Made Up Nationals Final/ }).check();
  await page.getByRole('button', { name: 'Remove the other 2' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Remove' }).click();
  await expect(page.getByText('Some scorecards may be repeats')).toHaveCount(0);
  await expect(page.locator('a[href^="/events/"]')).toHaveCount(1);
  await expect(page.locator('a[href^="/events/"] h3')).toHaveText('Made Up Nationals Final');
});

test('a parent imports a scorecard PDF, sees it in Insights and deletes it', async ({ page, account }, testInfo) => {
  await addArcher(account, 'Test Archer');
  const items = JSON.parse(
    fs.readFileSync(path.resolve(__dirname, '../features/archery/lib/__tests__/fixtures/indoor-archers-cup.json'), 'utf8'),
  );
  const file = testInfo.outputPath('made-up-scorecard.pdf');
  fs.writeFileSync(file, scorecardPdf(items));

  await signIn(page, 'archery', account.email);
  await page.goto('/import');
  await page.locator('input[type="file"]').setInputFiles(file);
  await page.getByRole('button', { name: /^Save/ }).first().click();
  await expect(page.getByRole('link', { name: 'View scorecard' })).toBeVisible({ timeout: 30_000 });

  await page.goto('/dashboard');
  await expect(page.locator('a[href^="/events/"] h3')).toHaveText('2026 Archers Cup');
  await page.goto('/insights');
  await expect(page.getByText('Where the arrows landed')).toBeVisible();

  await page.goto('/dashboard');
  await page.locator('a[href^="/events/"]').first().click();
  await page.getByRole('button', { name: 'Delete scorecard' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: /delete/i }).click();
  await page.waitForURL(/\/dashboard/);
  await expect(page.locator('a[href^="/events/"]')).toHaveCount(0);
});

test('Insights marks one personal best and keeps its axes readable (SQ-033, SQ-035) @phone', async ({ page, account }) => {
  // Insights is 3 px too wide at 393 px.
  knownFailureOn('iphone', 'SQ-043');
  const archer = await addArcher(account, 'Pat Madeup');
  // An even split over all six colors, which once made the percent axis read "0001%".
  // Spread over two years, so the date axis has to show them.
  const dates = ['2024-03-02', '2024-07-13', '2024-11-09', '2025-02-22', '2025-06-14', '2025-10-04'];
  await seedSearch(account, archer, [
    match(0, { arrows: 'T8642M', tournament_date: dates[0] }),
    ...Array.from({ length: 5 }, (_, i) => match(i + 1, { tournament_date: dates[i + 1] })),
  ]);
  await signIn(page, 'archery', account.email);
  await page.goto('/import');
  await page.getByRole('button', { name: 'Import 6 selected' }).click();
  await expect(page.getByText(/^Already imported/)).toHaveCount(6, { timeout: 60_000 });

  await page.goto('/dashboard');
  await expect(page.locator('a[href^="/events/"]:has-text("PB")')).toHaveCount(1);

  await page.goto('/insights');
  await expect(page.locator('table svg.lucide-trophy')).toHaveCount(1);
  const percentTicks = page.locator('.recharts-yAxis .recharts-cartesian-axis-tick-value').filter({ hasText: '%' });
  await expect(percentTicks).toHaveText(['0%', '25%', '50%', '75%', '100%']);
  await expect(page.locator('.recharts-xAxis .recharts-cartesian-axis-tick-value').first()).toContainText("'2");
  await expectNoSidewaysScroll(page);
});
