import { admin, expect, PASSWORD, test, uniqueEmail } from './support/app';
import { supabaseEnv } from './support/env';

const mailUrl = supabaseEnv().mailUrl;

/** The confirmation link from the local stack's test mailbox. */
async function confirmationLink(email: string): Promise<string> {
  for (let attempt = 0; attempt < 20; attempt++) {
    const search = await fetch(`${mailUrl}/api/v1/search?query=${encodeURIComponent(`to:${email}`)}`);
    const { messages } = (await search.json()) as { messages: { ID: string }[] };
    if (messages?.length) {
      const message = (await (await fetch(`${mailUrl}/api/v1/message/${messages[0]!.ID}`)).json()) as { HTML: string; Text: string };
      const link = /https?:\/\/[^\s"'<>]+verify[^\s"'<>]+/.exec(message.HTML || message.Text)?.[0];
      if (link) return link.replace(/&amp;/g, '&');
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error('No confirmation email arrived');
}

test('a new parent registers, confirms by email and lands on the dashboard @phone', async ({ page }) => {
  const email = uniqueEmail('signup');
  try {
    await page.goto('/?sport=archery');
    await page.goto('/login');
    await page.getByLabel('Email').fill(email);
    await page.getByLabel('Password').fill(PASSWORD);
    await page.getByRole('button', { name: 'Register as a New User' }).click();
    await expect(page.getByText('Please check your email to confirm your account.')).toBeVisible();

    await page.goto(await confirmationLink(email));
    // A new account starts on its account page, with the dialog to add a first archer.
    await page.waitForURL(/\/(dashboard|account)/);
    await expect(page.getByRole('heading', { name: 'Add Archer Profile' })).toBeVisible();
  } finally {
    const { data } = await admin().auth.admin.listUsers({ perPage: 1000 });
    const user = data.users.find((u) => u.email === email);
    if (user) await admin().auth.admin.deleteUser(user.id);
  }
});

test('a wrong password shows an error and keeps the email, not the password (SQ-031)', async ({ page, account }) => {
  await page.goto('/?sport=gymnastics');
  await page.goto('/login');
  await page.getByLabel('Email').fill(account.email);
  await page.getByLabel('Password').fill('not-the-password');
  await page.getByRole('button', { name: 'Sign In with Password' }).click();
  await expect(page.getByText('Error', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Email')).toHaveValue(account.email);
  await expect(page.getByLabel('Password')).toHaveValue('');
});

test('a parent signs in and out', async ({ page, account }) => {
  await page.goto('/?sport=gymnastics');
  await page.goto('/login');
  await page.getByLabel('Email').fill(account.email);
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign In with Password' }).click();
  await page.waitForURL(/\/dashboard/);

  await page.getByRole('button', { name: /account menu/i }).click();
  await page.getByRole('menuitem', { name: /log out|sign out/i }).click();
  await page.waitForURL(/\/login/);
  await page.goto('/dashboard');
  await page.waitForURL(/\/login/);
});
