'use client';

import { Button } from '@scoresquid/ui/components/button';
import { Input } from '@scoresquid/ui/components/input';
import { Label } from '@scoresquid/ui/components/label';
import { setActiveArcher } from '@/app/archery/actions/archer';

/** The membership number and competition start date, in the add and edit dialogs. */
export function ArcherDetailsFields({
  membershipNumber,
  competitionStartDate,
}: {
  membershipNumber?: string | null;
  competitionStartDate?: string | null;
}) {
  return (
    <>
      <div className="space-y-2">
        <Label htmlFor="membership_number">USA Archery membership number (optional)</Label>
        <Input
          id="membership_number"
          name="membership_number"
          inputMode="numeric"
          defaultValue={membershipNumber ?? ''}
          placeholder="e.g. 123456"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="competition_start_date">Competition start date (optional)</Label>
        <Input
          id="competition_start_date"
          name="competition_start_date"
          type="date"
          defaultValue={competitionStartDate ?? ''}
        />
        <p className="text-xs text-muted-foreground">
          When this archer began competing. A Between Ends search looks back to this date.
        </p>
      </div>
    </>
  );
}

/** A save error, with a way to switch to the archer who already has the number. */
export function ArcherSaveError({
  error,
  existingArcherId,
}: {
  error: string | null;
  existingArcherId?: string;
}) {
  if (!error) return null;
  return (
    <div role="alert" className="space-y-2 text-sm text-destructive">
      <p>{error}</p>
      {existingArcherId && (
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => setActiveArcher(existingArcherId)}
        >
          Switch to them
        </Button>
      )}
    </div>
  );
}
