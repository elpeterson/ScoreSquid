import {
  expect,
  expectNoSidewaysScroll,
  expectPickerCentred,
  expectTabsInsideBars,
  expectTouchTargets,
  signIn,
  test,
} from './support/app';
import { addArcher, addGymnast, addMeet, arrowTotal, distinctArrows, seedSearch } from './support/seed';

// Every screen at the device's own width and at a small 360 px phone (SQ-043). Long,
// made-up names make the layouts work hardest.
const WIDTHS = [360, undefined];

async function checkScreen(page: import('@playwright/test').Page, isMobile: boolean) {
  const own = page.viewportSize()!;
  for (const width of WIDTHS) {
    if (width) await page.setViewportSize({ width, height: own.height });
    await expectNoSidewaysScroll(page);
    await expectTabsInsideBars(page);
    if (await page.locator('header [role="combobox"]').count()) await expectPickerCentred(page);
    if (isMobile) await expectTouchTargets(page);
    if (width) await page.setViewportSize(own);
  }
}

// Signed in, the sport's landing page shows "Go to Dashboard" without scrolling, and
// "Log out" keeps its arrow on the same line.
async function expectLandingFits(page: import('@playwright/test').Page) {
  await page.goto('/');
  const viewport = page.viewportSize()!;
  const cta = await page.getByRole('link', { name: 'Go to Dashboard' }).boundingBox();
  expect(cta!.y + cta!.height, 'Go to Dashboard bottom edge (px)').toBeLessThanOrEqual(viewport.height);
  const logout = await page.getByRole('button', { name: /Log out/ }).boundingBox();
  expect(logout!.height, 'Log out button height (px)').toBeLessThan(48);
}

test('archery screens fit a phone @phone', async ({ page, account, isMobile }) => {
  const archer = await addArcher(account, 'Robin Madeup-Longername');
  await seedSearch(
    account,
    archer,
    Array.from({ length: 3 }, (_, i) => ({
      event_id: 7000 + i,
      aid: 8000 + i,
      match_kind: 'number' as const,
      tournament_name: `2025 USA Archery Indoor Nationals Made Up Long Tournament Name ${i}`,
      tournament_date: `2025-0${i + 1}-15`,
      arrows: distinctArrows(i),
      total: arrowTotal(distinctArrows(i)),
    })),
  );
  await page.goto('/');
  await checkScreen(page, isMobile);
  await page.goto('/?sport=archery');
  await page.goto('/login');
  await checkScreen(page, isMobile);

  await signIn(page, 'archery', account.email);
  await expectLandingFits(page);
  await page.goto('/import');
  await checkScreen(page, isMobile); // results listed, with setup fields open
  await page.getByRole('button', { name: /^Import \d+ selected$/ }).click();
  await expect(page.getByText(/^Already imported/)).toHaveCount(3, { timeout: 60_000 });

  for (const path of ['/dashboard', '/insights', '/account']) {
    await page.goto(path);
    await checkScreen(page, isMobile);
  }
  await page.goto('/dashboard');
  await page.locator('a[href^="/events/"]').first().click();
  await page.waitForURL(/\/events\//);
  await checkScreen(page, isMobile);
});

test('gymnastics screens fit a phone @phone', async ({ page, account, isMobile }) => {
  const gymnast = await addGymnast(account, 'Sam Madeup-Longername', 'WAG', '1001');
  const meet = await addMeet(
    account,
    gymnast,
    { name: '2026 Made Up State Championships Long Meet Name', date: '2026-03-01', level: '6' },
    { vault: 9.1, uneven_bars: 8.9, balance_beam: 9.3, floor_exercise: 9.2 },
  );
  await addMeet(account, gymnast, { name: 'Made Up Invitational', date: '2026-02-01', level: '6' }, { vault: 9 });
  await signIn(page, 'gymnastics', account.email);
  await expectLandingFits(page);
  for (const path of ['/dashboard', '/import', '/insights', '/scores/new', `/competitions/${meet}/edit`, '/account', '/about']) {
    await page.goto(path);
    await checkScreen(page, isMobile);
  }
});
