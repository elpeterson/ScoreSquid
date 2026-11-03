# SQ-042: Women's gymnastics, checked against MSO

Checked 2026-11-03 against one women's gymnast's full history on MeetScoresOnline
(four seasons), with a men's gymnast for comparison. Every
request was read-only and about one a second: the gymnast's meet list page, two
results pages with and without the athlete, `lookup_gymnast` for both siblings and
`lookup_scores2` for two meets. The app's own parsing code ran over the saved
responses. No responses, IDs or names are kept in the repo.

**Status:** finding 1 is fixed (SQ-048) and finding 2 is fixed (SQ-049, with a
migration that cleans levels already saved). Finding 3 is fixed (SQ-050: women's meet
lists come from `lookup_gymnast`, which has dates). Finding 4 is SQ-051.

## How women's import works today
- Women's (`WAG`) uses the HTML scrape for both the meet list and the import, never
  the JSON API (`fetchMsoMeetsApi` in `app/gymnastics/actions/mso.ts`).
- The meet list comes from `/Athlete.MyScores/<athlete>`. Each meet links to
  `/results/<meet>/<athlete>#<session>__<level>__<age group>`.
- The import reads `/results/<meet>/<athlete>`, whose `#athlete` table has one row per
  apparatus plus `AA`.

## Results

| Criterion | Result | Notes |
|---|---|---|
| 1. Find and import | **Scores pass, meet ID fails** | Vault, bars, beam and floor land on the right apparatus at a 2026 and a 2023 meet. Tie places (`14T`, `5*`) parse, the date range reads correctly and the all-around (the sum) matches MSO's `AAScore`. But the meet ID is lost: see finding 1. |
| 2. Levels | **Fails** | The saved level is the list's whole "Level Division" cell, e.g. `6 Group 2 (opens meet scores)`. See finding 2. Hand-entered levels are free text, so `Gold` and MSO's `XG` never meet. See finding 4. |
| 3. Re-import and fill gaps | **Fails** | Both refuse every women's meet, because none has an MSO meet ID. With the ID fixed, re-import would still read the meet page without the athlete, which has no athlete table. See finding 1. |
| 4. Manual entry and edit | **Passes** | The form, the server check (`apparatusFor`) and the dashboard all take the four apparatus from the gymnast's discipline. |
| 5. Insights | **Passes, but split by finding 2** | The chart and filters use the four apparatus and their colors. Imported meets each form their own level group, because each level string carries that meet's age group. |
| 7. Men's unchanged | Not affected | Nothing in this check changes code. |

## Findings

1. **Women's meets lose their MSO meet ID.** `msoMeetIdFromUrl` accepts only
   `/results/<meet>`, but women's links are `/results/<meet>/<athlete>`, so it returns
   null. The import saves `mso_meet_id = null`, the next sync recognises the meet by
   name only, and re-import, fill from MSO and "not this meet" all stop at "not linked"
   or "Missing meet id". The unique index can't catch a second import of a renamed meet.
   Re-import's scrape path also requests `/results/<meet>` with no athlete, which has no
   `#athlete` table. Saved meets would heal on the next sync once the ID parses, as
   `matchSavedMeets` fills in a missing ID when the name matches.
2. **Imported women's levels carry the age group and a screen-reader label.** The list
   cell is `<level> <age group> (opens meet scores)`. MSO's women's levels are single
   tokens: `1` to `10`, and Xcel `XB`, `XS`, `XG`, `XP`, `XD`, `XSA`. The age group
   (`Group 2`, `Penny`, `JR B`) is set per meet, so like the men's `div` it isn't a
   competitive division. The level should be the first token, and existing rows need a
   one-off clean-up.
3. **The women's meet list shows "Date TBD" for every meet.** The list page has no date
   column (its columns are meet, team, level and division, all-around, then one per
   season). Suggestions for hand-entered meets therefore compare names only.
4. **Women's levels are free text.** The form suggests "Level 4 or Gold", while MSO
   stores `4` and `XG`, so the same level splits in Insights. Xcel codes also show raw
   (`XG`) wherever the level is shown.

## Slot layout (settles the conflicting notes)
In `lookup_scores2`, `EventType` is `ARTW` for women, and `EventScore1` to `EventScore4`
are vault, bars, beam and floor, matching the results page at both meets. Slots 5 and
6 are empty for all 4,081 women's rows across the two meets. The spike's "different
slot layout" note was wrong. Women's import could use the JSON API, but that is out of
scope here.
