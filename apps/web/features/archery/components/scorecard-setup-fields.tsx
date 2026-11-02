'use client';

import { Input } from '@scoresquid/ui/components/input';
import { Label } from '@scoresquid/ui/components/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@scoresquid/ui/components/select';
import type { Setup } from '@/features/archery/lib/betweenends/import-plan';
import { BOW_STYLE_LABELS } from '@/features/archery/lib/division';

const FACES = ['40', '60', '80', '122'];

/** Where, bow, distance and face: what neither a PDF nor Between Ends fully says. */
export function ScorecardSetupFields({ setup, onChange }: { setup: Setup; onChange: (setup: Setup) => void }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <div className="space-y-1">
        <Label className="text-xs">Where</Label>
        <Select
          value={setup.environment}
          onValueChange={(v) => onChange({ ...setup, environment: v as Setup['environment'] })}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="indoor">Indoor</SelectItem>
            <SelectItem value="outdoor">Outdoor</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1">
        <Label className="text-xs">Bow</Label>
        <Select value={setup.bowStyle} onValueChange={(v) => onChange({ ...setup, bowStyle: v })}>
          <SelectTrigger>
            <SelectValue placeholder="Bow style" />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(BOW_STYLE_LABELS).map(([value, label]) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1">
        <Label className="text-xs">Distance (m)</Label>
        <Input
          type="number"
          inputMode="decimal"
          min={1}
          className="no-spinners"
          value={setup.distance}
          placeholder="e.g. 30"
          onChange={(e) => onChange({ ...setup, distance: e.target.value })}
        />
      </div>
      <div className="space-y-1">
        <Label className="text-xs">Face (cm)</Label>
        <Select value={setup.face} onValueChange={(v) => onChange({ ...setup, face: v })}>
          <SelectTrigger>
            <SelectValue placeholder="Face size" />
          </SelectTrigger>
          <SelectContent>
            {FACES.map((f) => (
              <SelectItem key={f} value={f}>
                {f} cm
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
