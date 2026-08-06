-- Let's Play Cricket: scorer workflow state and player profile type.
-- Run this in Supabase SQL Editor after migration 0006.

alter table public.players
  add column if not exists player_type text check (player_type in ('batting', 'bowling', 'fielding'));

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'players_player_type_required_for_new_rows'
  ) then
    alter table public.players
      add constraint players_player_type_required_for_new_rows
      check (player_type is not null) not valid;
  end if;
end $$;

alter table public.innings
  add column if not exists pending_action text check (pending_action in ('incoming_batter', 'next_bowler')),
  add column if not exists pending_dismissed_player_id uuid references public.players(id) on delete set null,
  add column if not exists pending_previous_bowler_id uuid references public.players(id) on delete set null,
  add column if not exists pending_completed_over smallint;
