-- Remember which MeetScoresOnline meet an imported competition came from, so
-- imports match on MSO's ID, not the name. Existing rows stay null until a sync
-- matches them by name and date. A gymnast can hold each MSO meet only once.

alter table public.gym_competitions
  add column mso_meet_id text check (mso_meet_id ~ '^[0-9]+$');

create unique index gym_competitions_athlete_mso_meet_unique
  on public.gym_competitions (athlete_id, mso_meet_id)
  where mso_meet_id is not null;
