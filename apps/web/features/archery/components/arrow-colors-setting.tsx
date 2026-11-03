'use client';

import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@scoresquid/ui/components/card';
import { Label } from '@scoresquid/ui/components/label';
import { Switch } from '@scoresquid/ui/components/switch';
import { ArrowChip } from '@/features/archery/components/arrow-chip';
import type { ArrowColorMode } from '@/features/archery/lib/arrow-colors';

const SAMPLE = ['X', '10', '9', '8', '7', '6', '5', '4', '3', '2', '1', 'M'];

function Preview({ mode, label }: { mode: ArrowColorMode; label: string }) {
  return (
    <div className="space-y-1.5" data-arrow-preview={mode}>
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <div className="flex flex-wrap gap-1">
        {SAMPLE.map((v) => (
          <ArrowChip key={v} value={v} />
        ))}
      </div>
    </div>
  );
}

/** The SQ-037 choice between target-face and detailed arrow colors, saved to the account. */
export function ArrowColorsSetting({
  detailed,
  updateSetting,
}: {
  detailed: boolean;
  updateSetting: (key: 'detailed_arrow_colors', value: boolean) => Promise<{ error?: string } | unknown>;
}) {
  const [on, setOn] = useState(detailed);
  const [pending, startTransition] = useTransition();

  const change = (next: boolean) => {
    setOn(next);
    startTransition(async () => {
      const result = (await updateSetting('detailed_arrow_colors', next)) as { error?: string } | undefined;
      if (result?.error) {
        setOn(!next);
        toast.error("Couldn't save your arrow colors. Try again.");
      }
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Arrow colors</CardTitle>
        <CardDescription>
          How scorecards and arrow distributions color each score. Saved to your account, so it
          follows you to every device.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <Label htmlFor="detailed-arrow-colors">Detailed arrow colors</Label>
            <p className="text-sm text-muted-foreground">
              A darker and lighter shade in each ring, so a 10 and a 9 look different. X gets a dot.
            </p>
          </div>
          <Switch
            id="detailed-arrow-colors"
            checked={on}
            disabled={pending}
            onCheckedChange={change}
            className="mt-1"
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Preview mode="standard" label="Standard: matches the target face" />
          <Preview mode="detailed" label="Detailed" />
        </div>
        <p className="text-xs text-muted-foreground">
          Scores and stats don&apos;t change. &ldquo;Where the arrows landed&rdquo; still groups arrows by
          target color.
        </p>
      </CardContent>
    </Card>
  );
}
