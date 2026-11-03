'use client';

import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { Button } from '@scoresquid/ui/components/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@scoresquid/ui/components/card';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@scoresquid/ui/components/alert-dialog';
import { keepOneScorecard } from '@/app/archery/(main)/dashboard/actions';

type RepeatCard = { id: string; name: string; detail: string; total: number };
type RepeatGroup = { keep: string; cards: RepeatCard[] };

export function RepeatedScorecards({ groups }: { groups: RepeatGroup[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Some scorecards may be repeats</CardTitle>
        <CardDescription>
          Between Ends can list one result in several tournaments. These have the same arrows on the same day, so they
          count more than once in trends. Nothing is removed unless you choose.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {groups.map((group) => (
          <RepeatGroupChoice key={group.cards[0]!.id} group={group} />
        ))}
      </CardContent>
    </Card>
  );
}

function RepeatGroupChoice({ group }: { group: RepeatGroup }) {
  const [keep, setKeep] = useState(group.keep);
  const [pending, startTransition] = useTransition();
  const others = group.cards.length - 1;
  const noun = others === 1 ? 'scorecard' : 'scorecards';

  const remove = () =>
    startTransition(async () => {
      const { error } = await keepOneScorecard(keep);
      if (error) toast.error(error);
      else toast.success(`Removed ${others} ${noun}`);
    });

  return (
    <fieldset className="space-y-3">
      <legend className="text-sm font-medium">Choose the one to keep</legend>
      <div className="divide-y rounded-md border">
        {group.cards.map((card) => (
          <label key={card.id} className="flex items-start gap-3 p-3 text-sm">
            <input
              type="radio"
              name={`repeat-${group.cards[0]!.id}`}
              className="mt-1 h-4 w-4 shrink-0 accent-primary"
              checked={keep === card.id}
              onChange={() => setKeep(card.id)}
            />
            <span className="min-w-0 flex-1">
              <span className="block font-medium break-words">{card.name}</span>
              <span className="block text-xs text-muted-foreground">{card.detail}</span>
            </span>
            <span className="shrink-0 font-semibold tabular-nums">{card.total}</span>
          </label>
        ))}
      </div>
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button variant="outline" disabled={pending}>
            {pending ? 'Removing…' : `Remove the other ${others}`}
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Remove {others} {noun}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              The one you chose stays. This can&apos;t be undone, though you can import a result again from Between Ends.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={remove}>Remove</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </fieldset>
  );
}
