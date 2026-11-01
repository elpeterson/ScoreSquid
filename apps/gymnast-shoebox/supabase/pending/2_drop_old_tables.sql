-- Remove the pre-ScoreSquid gymnastics tables. THIS DELETES THEM: there's no undo
-- without a backup.
--
-- Only after the new app has run well in production and a fresh backup exists.
-- When it's time, move this file to migrations/ with a new timestamp, so that
-- every database ends up with the same schema.

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
