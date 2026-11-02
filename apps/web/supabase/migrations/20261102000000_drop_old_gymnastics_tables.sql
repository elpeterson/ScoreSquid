-- Remove the pre-ScoreSquid gymnastics tables, whose data moved to the shared
-- tables at cutover. THIS DELETES THEM: there's no undo without a backup.

begin;

drop view public.competitions_with_scores;
drop table public.scores;
drop table public.competitions;
drop table public.gymnasts;

-- These moved to gym_settings; user_settings keeps what is shared.
alter table public.user_settings
  drop column show_start_values,
  drop column show_placements;

commit;
