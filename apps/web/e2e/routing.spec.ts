import { expect, expectNoSidewaysScroll, test } from './support/app';

test('the picker offers both sports, and each opens its own sign-in @phone', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('link', { name: /archery/i }).first()).toBeVisible();
  await expect(page.getByRole('link', { name: /gymnastics/i }).first()).toBeVisible();
  await expectNoSidewaysScroll(page);

  await page.goto('/?sport=archery');
  await page.goto('/login');
  await expect(page).toHaveTitle(/Archery/);
  await expect(page.getByLabel('Email')).toBeVisible();

  await page.goto('/?sport=gymnastics');
  await page.goto('/login');
  await expect(page).toHaveTitle(/Gymnastics/);
  await expectNoSidewaysScroll(page);
});

test('signed-out pages send a visitor to sign in', async ({ page }) => {
  await page.goto('/?sport=archery');
  for (const path of ['/dashboard', '/import', '/insights']) {
    await page.goto(path);
    await page.waitForURL(/\/login/);
  }
});
