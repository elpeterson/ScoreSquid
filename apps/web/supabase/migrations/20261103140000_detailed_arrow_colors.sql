-- SQ-037: an optional detailed color view for arrow chips, saved per account so it
-- follows the user to every device. Off by default, so scorecards keep matching the
-- target face until someone chooses otherwise. user_settings keeps its existing RLS
-- (each user reads and writes only their own row).
alter table public.user_settings
  add column if not exists detailed_arrow_colors boolean not null default false;
