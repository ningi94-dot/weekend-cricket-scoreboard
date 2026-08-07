-- Let's Play Cricket: preserve captain team-picking order.

alter table public.match_squads
  add column if not exists sort_order integer not null default 0;

with ranked_squads as (
  select
    match_id,
    player_id,
    row_number() over (
      partition by match_id, team_side
      order by is_captain desc, player_id
    ) - 1 as fallback_order
  from public.match_squads
)
update public.match_squads squad
set sort_order = ranked_squads.fallback_order
from ranked_squads
where squad.match_id = ranked_squads.match_id
  and squad.player_id = ranked_squads.player_id
  and squad.sort_order = 0;

create index if not exists match_squads_match_side_order_idx
  on public.match_squads (match_id, team_side, sort_order);
