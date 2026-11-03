'use client';

import { useState, useTransition, useCallback } from 'react';
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
  applyMsoLink,
  applyMsoReimport,
  fetchMsoMeets,
  importMsoMeet,
  previewMsoLink,
  previewMsoReimport,
  rejectMsoSuggestion,
  type LinkableMeet,
  type MsoMeetSummary,
} from '@/app/gymnastics/actions/mso';
import type { MeetChange } from '@/features/gymnastics/lib/meet-diff';
import { formatDate } from '@/lib/dates';
import { monthYearLabel } from '@/features/gymnastics/lib/meet-match';
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
  const [review, setReview] = useState<{
    meet: MsoMeetSummary;
    savedId: string;
    changes: MeetChange[];
    linking: boolean;
  } | null>(null);
  const [linkable, setLinkable] = useState<LinkableMeet[]>([]);
  const [linkPicker, setLinkPicker] = useState<MsoMeetSummary | null>(null);
  const [linkChoice, setLinkChoice] = useState('');
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
        setLinkable(result.linkable);
        toast.success(`Found ${result.meets.length} meets`);
      }
    });
  }, []);

  const handleImport = async (meet: MsoMeetSummary) => {
    if (importingIds.has(meet.id)) return;
    setImportingIds((prev) => new Set(prev).add(meet.id));

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
      openReview(meet, meet.savedId, result.changes, false);
    }
  };

  /** Only empty fields start ticked: anything the parent entered stays unless they choose. */
  const openReview = (
    meet: MsoMeetSummary,
    savedId: string,
    changes: MeetChange[],
    linking: boolean,
  ) => {
    setChosen(new Set(changes.filter((c) => c.gap).map((c) => c.key)));
    setReview({ meet, savedId, changes, linking });
  };

  const handleLinkPreview = async (meet: MsoMeetSummary, savedId: string) => {
    setLinkPicker(null);
    setImportingIds((prev) => new Set(prev).add(meet.id));
    const result = await previewMsoLink(savedId, meet);
    setImportingIds((prev) => {
      const next = new Set(prev);
      next.delete(meet.id);
      return next;
    });
    if (result.error !== undefined) toast.error(result.error);
    else openReview(meet, savedId, result.changes, true);
  };

  const handleReject = async (meet: MsoMeetSummary, savedId: string) => {
    const result = await rejectMsoSuggestion(savedId, meet);
    if (result.error) {
      toast.error(result.error);
      return;
    }
    setMeets((prev) =>
      prev.map((m) =>
        m.id === meet.id
          ? { ...m, suggestedIds: m.suggestedIds?.filter((id) => id !== savedId) }
          : m,
      ),
    );
  };

  const toggleChosen = (key: string) =>
    setChosen((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const handleApply = async () => {
    if (!review) return;
    const { meet, savedId, linking } = review;
    setIsApplying(true);
    const result = await (linking ? applyMsoLink : applyMsoReimport)(savedId, meet, [...chosen]);
    setIsApplying(false);

    if (result.error) {
      toast.error(result.error);
      return;
    }
    toast.success(linking ? 'Meet linked to MSO.' : 'Meet updated from MSO.');
    if (linking) {
      setMeets((prev) =>
        prev.map((m) =>
          m.id === meet.id
            ? { ...m, isImported: true, savedId, suggestedIds: [] }
            : { ...m, suggestedIds: m.suggestedIds?.filter((id) => id !== savedId) },
        ),
      );
      setLinkable((prev) => prev.filter((l) => l.id !== savedId));
    }
    setReview(null);
    router.refresh();
  };

  const describeSaved = (id: string) => {
    const saved = linkable.find((l) => l.id === id);
    return saved ? `${saved.name} · ${formatDate(saved.start_date)}` : 'one of your meets';
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
            Enter your Athlete ID, then press Sync Meets to find meets on MeetScoresOnline.com
          </CardDescription>
        </CardHeader>
        <CardContent className="flex gap-4 items-end">
          <div className="grid w-full max-w-sm items-center gap-1.5">
            <Label htmlFor="msoId">Athlete ID</Label>
            <Input
              id="msoId"
              placeholder="1234567"
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
                  className="flex flex-wrap items-center justify-between gap-3 p-4 border rounded-lg bg-muted/10"
                >
                  <div className="space-y-1">
                    <h4 className="font-bold text-lg leading-none">
                      {meet.name}
                    </h4>
                    <p className="text-sm text-muted-foreground">
                      {[meet.level && `Level ${meet.level}`, monthYearLabel(meet.dateStr)]
                        .filter(Boolean)
                        .join(' · ')}
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
                  ) : meet.suggestedIds?.[0] ? (
                    <div className="w-full space-y-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 sm:w-auto sm:max-w-md">
                      <p>
                        Possible match with your meet:{' '}
                        <strong>{describeSaved(meet.suggestedIds[0])}</strong>
                      </p>
                      <div className="flex flex-wrap gap-2">
                        <Button
                          size="sm"
                          onClick={() => handleLinkPreview(meet, meet.suggestedIds![0])}
                          disabled={importingIds.has(meet.id)}
                        >
                          {importingIds.has(meet.id) && (
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          )}
                          Review and fill
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleReject(meet, meet.suggestedIds![0])}
                        >
                          Not the same meet
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex shrink-0 flex-wrap items-center gap-2">
                      {linkable.length > 0 && (
                        <Button
                          variant="outline"
                          onClick={() => {
                            setLinkChoice(linkable[0].id);
                            setLinkPicker(meet);
                          }}
                        >
                          Link to my meet
                        </Button>
                      )}
                      <Button
                        onClick={() => handleImport(meet)}
                        disabled={importingIds.has(meet.id)}
                      >
                        {importingIds.has(meet.id) ? (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : null}
                        {linkable.length > 0 ? 'Import as new' : 'Import'}
                      </Button>
                    </div>
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
            <DialogTitle>
              {review?.linking ? 'Fill from' : 'Re-import'} {review?.meet.name}
            </DialogTitle>
            <DialogDescription>
              {review?.linking && review.changes.length === 0
                ? 'Your meet already matches MSO. Linking it changes nothing else.'
                : 'Empty fields are ticked. Tick anything else to take from MSO. The rest stays as you have it.'}
            </DialogDescription>
          </DialogHeader>
          {review && review.changes.length > 0 && (
            <div className="flex justify-end">
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setChosen(new Set(review.changes.map((c) => c.key)))}
              >
                Select all
              </Button>
            </div>
          )}
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
            <Button
              onClick={handleApply}
              disabled={isApplying || (!review?.linking && chosen.size === 0)}
            >
              {isApplying && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {review?.linking ? 'Link and update' : 'Update'} {chosen.size}{' '}
              {chosen.size === 1 ? 'field' : 'fields'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={linkPicker !== null} onOpenChange={(open) => !open && setLinkPicker(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Link {linkPicker?.name}</DialogTitle>
            <DialogDescription>
              Choose your meet. You can review what changes before anything is saved.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-1.5">
            <Label htmlFor="linkChoice">Your meet</Label>
            <select
              id="linkChoice"
              className="h-9 w-full rounded-md border bg-background px-3 text-sm"
              value={linkChoice}
              onChange={(e) => setLinkChoice(e.target.value)}
            >
              {linkable.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name} · {formatDate(l.start_date)}
                </option>
              ))}
            </select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setLinkPicker(null)}>
              Cancel
            </Button>
            <Button
              onClick={() => linkPicker && handleLinkPreview(linkPicker, linkChoice)}
              disabled={!linkChoice}
            >
              Review
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
