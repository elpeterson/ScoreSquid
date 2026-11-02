'use client';

import { useState, useTransition, useEffect, useCallback } from 'react';
import { Button } from '@scoresquid/ui/components/button';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@scoresquid/ui/components/card';
import { Input } from '@scoresquid/ui/components/input';
import { Label } from '@scoresquid/ui/components/label';
import {
  applyMsoReimport,
  fetchMsoMeets,
  importMsoMeet,
  previewMsoReimport,
  type MsoMeetSummary,
} from '@/app/gymnastics/actions/mso';
import type { MeetChange } from '@/features/gymnastics/lib/meet-diff';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@scoresquid/ui/components/dialog';
import { toast } from 'sonner';
import { Check, CloudDownload, Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';

export function ImportView({ initialMsoId }: { initialMsoId?: string | null }) {
  const [msoId, setMsoId] = useState(initialMsoId || '');
  const [meets, setMeets] = useState<MsoMeetSummary[]>([]);
  const [isPending, startTransition] = useTransition();
  const [importingIds, setImportingIds] = useState<Set<string>>(new Set());
  const router = useRouter();
  const [review, setReview] = useState<{ meet: MsoMeetSummary; changes: MeetChange[] } | null>(null);
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const [isApplying, setIsApplying] = useState(false);

  const handleSync = useCallback((idToSync: string) => {
    if (!idToSync) {
      toast.error('Please enter an MSO ID');
      return;
    }

    startTransition(async () => {
      const result = await fetchMsoMeets(idToSync);
      if (result.error) {
        toast.error(result.error);
      } else if (result.meets) {
        setMeets(result.meets);
        toast.success(`Found ${result.meets.length} meets`);
      }
    });
  }, []);

  useEffect(() => {
    if (initialMsoId) {
      handleSync(initialMsoId);
    }
  }, [initialMsoId, handleSync]);

  const handleImport = async (meet: MsoMeetSummary) => {
    if (importingIds.has(meet.id)) return;
    setImportingIds((prev) => new Set(prev).add(meet.id));
    toast.info(`Importing ${meet.name}...`);

    const result = await importMsoMeet(meet);
    setImportingIds((prev) => {
      const next = new Set(prev);
      next.delete(meet.id);
      return next;
    });

    if (result.error) {
      toast.error(result.error);
    } else {
      toast.success('Meet Imported Successfully!');
      setMeets((prev) =>
        prev.map((m) =>
          m.id === meet.id ? { ...m, isImported: true, savedId: result.savedId } : m,
        )
      );
      router.refresh();
    }
  };

  const handleReimport = async (meet: MsoMeetSummary) => {
    if (!meet.savedId || importingIds.has(meet.id)) return;
    setImportingIds((prev) => new Set(prev).add(meet.id));
    const result = await previewMsoReimport(meet.savedId, meet);
    setImportingIds((prev) => {
      const next = new Set(prev);
      next.delete(meet.id);
      return next;
    });

    if (result.error !== undefined) {
      toast.error(result.error);
    } else if (result.changes.length === 0) {
      toast.success(`${meet.name} is up to date with MSO.`);
    } else {
      setChosen(new Set(result.changes.map((c) => c.key)));
      setReview({ meet, changes: result.changes });
    }
  };

  const toggleChosen = (key: string) =>
    setChosen((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const handleApply = async () => {
    if (!review?.meet.savedId) return;
    setIsApplying(true);
    const result = await applyMsoReimport(review.meet.savedId, review.meet, [...chosen]);
    setIsApplying(false);

    if (result.error) {
      toast.error(result.error);
    } else {
      toast.success('Meet updated from MSO.');
      setReview(null);
      router.refresh();
    }
  };

  return (
    <div className="max-w-4xl mx-auto py-10 space-y-8">
      <div className="flex items-center justify-between">
        <h2 className="text-3xl font-bold tracking-tight">Import from MSO</h2>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Sync Configuration</CardTitle>
          <CardDescription>
            Enter your Athlete ID to fetch meets from MeetScoresOnline.com
          </CardDescription>
        </CardHeader>
        <CardContent className="flex gap-4 items-end">
          <div className="grid w-full max-w-sm items-center gap-1.5">
            <Label htmlFor="msoId">Athlete ID</Label>
            <Input
              id="msoId"
              placeholder="1184668"
              value={msoId}
              onChange={(e) => setMsoId(e.target.value)}
            />
          </div>
          <Button onClick={() => handleSync(msoId)} disabled={isPending}>
            {isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <CloudDownload className="mr-2 h-4 w-4" />
            )}
            Sync Meets
          </Button>
        </CardContent>
      </Card>

      {meets.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Available Meets</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {meets.map((meet) => (
                <div
                  key={meet.id}
                  className="flex items-center justify-between p-4 border rounded-lg bg-muted/10"
                >
                  <div className="space-y-1">
                    <h4 className="font-bold text-lg leading-none">
                      {meet.name}
                    </h4>
                    <p className="text-sm text-muted-foreground">
                      Level {meet.level}
                    </p>
                  </div>

                  {meet.isImported ? (
                    <div className="flex shrink-0 items-center gap-2">
                      <span className="inline-flex items-center rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm font-medium text-green-700">
                        <Check className="mr-2 h-4 w-4" /> Imported
                      </span>
                      {meet.savedId && (
                        <Button
                          variant="outline"
                          onClick={() => handleReimport(meet)}
                          disabled={importingIds.has(meet.id)}
                        >
                          {importingIds.has(meet.id) && (
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          )}
                          Re-import
                        </Button>
                      )}
                    </div>
                  ) : (
                    <Button
                      onClick={() => handleImport(meet)}
                      disabled={importingIds.has(meet.id)}
                    >
                      {importingIds.has(meet.id) ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : null}
                      Import
                    </Button>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <Dialog open={review !== null} onOpenChange={(open) => !open && setReview(null)}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Re-import {review?.meet.name}</DialogTitle>
            <DialogDescription>
              These differ from MSO. Tick what to take from MSO. Anything else
              stays as it is.
            </DialogDescription>
          </DialogHeader>
          <ul className="divide-y rounded-md border">
            {review?.changes.map((change) => (
              <li key={change.key}>
                <label className="flex cursor-pointer items-start gap-3 p-3">
                  <input
                    type="checkbox"
                    className="mt-1 h-4 w-4"
                    checked={chosen.has(change.key)}
                    onChange={() => toggleChosen(change.key)}
                  />
                  <span className="min-w-0 text-sm">
                    <span className="block font-medium">{change.label}</span>
                    <span className="block break-words text-muted-foreground">
                      Yours: {change.mine}
                    </span>
                    <span className="block break-words">MSO: {change.mso}</span>
                  </span>
                </label>
              </li>
            ))}
          </ul>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReview(null)} disabled={isApplying}>
              Cancel
            </Button>
            <Button onClick={handleApply} disabled={isApplying || chosen.size === 0}>
              {isApplying && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Update {chosen.size} {chosen.size === 1 ? 'field' : 'fields'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
