import { createAccount, deleteAccount, expect, signIn, test } from './support/app';
import { addArcher, addGymnast, addMeet } from './support/seed';

test("one parent can't see another's scorecards or meets", async ({ page, account }) => {
  const other = await createAccount('other');
  try {
    const archer = await addArcher(other, 'Other Archer');
    const { data: event, error } = await other.db.rpc('import_scorecard', {
      payload: {
        event: {
          athlete_id: archer, name: 'Private Made Up Open', start_date: '2025-02-01', shot_on: '2025-02-01',
          environment: 'indoor', bow_style: 'recurve', distance_m: 18, face_cm: 40, arrows_per_end: 3,
          bonus_labels: [], source: 'manual',
        },
        rounds: [{ round_number: 1, total: 27, bonus: [], ends: [{ end_number: 1, arrows: ['9', '9', '9'] }] }],
      },
    });
    expect(error).toBeNull();
    const gymnast = await addGymnast(other, 'Other Gymnast', 'MAG', '1001');
    const meet = await addMeet(other, gymnast, { name: 'Private Made Up Meet', date: '2025-02-01' }, { vault: 12 });

    // Their rows are invisible through the API.
    const { data: rows } = await account.db.from('arch_events').select('id').eq('id', event as string);
    expect(rows).toEqual([]);

    // And through the app.
    await signIn(page, 'archery', account.email);
    await page.goto(`/events/${event}`);
    await expect(page.getByText('Private Made Up Open')).toHaveCount(0);

    await page.goto('/?sport=gymnastics');
    await page.goto(`/competitions/${meet}/edit`);
    await expect(page.getByText('Private Made Up Meet')).toHaveCount(0);
    await expect(page.locator('input[value="Private Made Up Meet"]')).toHaveCount(0);
  } finally {
    await deleteAccount(other);
  }
});
