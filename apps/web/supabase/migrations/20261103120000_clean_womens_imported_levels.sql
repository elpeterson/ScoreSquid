-- SQ-049: women's meets imported from MSO's meet list saved the list's whole
-- "Level Division" cell as the level, e.g. '6 Group 2 (opens meet scores)'. The age
-- group in it is set per meet, so one level split into a group per meet in Insights.
-- Keep only the level, its first word. Only women's gymnasts' rows in exactly that
-- shape change; men's meets and levels a parent typed are left as they are.

update public.gym_competitions c
set level = split_part(c.level, ' ', 1)
from public.gymnast_profiles p
where p.athlete_id = c.athlete_id
  and p.discipline = 'WAG'
  and c.level ~ '^[^ ]+ .* \(opens meet scores\)$';
