import { expect, signIn, test } from './support/app';
import { addArcher, addGymnast } from './support/seed';

// SQ-044: an optional Ko-fi link in the account menu of both sports.
for (const sport of ['gymnastics', 'archery'] as const) {
  test(`the ${sport} account menu links to Ko-fi, as optional @phone`, async ({ page, account }) => {
    if (sport === 'gymnastics') await addGymnast(account, 'Sam Madeup', 'MAG', '1001');
    else await addArcher(account, 'Robin Madeup');
    await signIn(page, sport, account.email);

    await page.getByRole('button', { name: 'Account menu' }).click();
    const link = page.getByRole('menuitem', { name: /Support ScoreSquid/ });
    await expect(link).toContainText('Optional');
    // A plain link: no user data in it, a new tab, and no opener or referrer.
    await expect(link).toHaveAttribute('href', 'https://ko-fi.com/elpeterson');
    await expect(link).toHaveAttribute('target', '_blank');
    await expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  });
}
