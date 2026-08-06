-- Let's Play Cricket: optional match joker.
-- A joker is stored once on the match and is eligible for both sides during scoring.

alter table public.matches
  add column if not exists joker_enabled boolean not null default false,
  add column if not exists joker_player_id uuid references public.players(id) on delete set null;

alter table public.matches
  drop constraint if exists matches_joker_requires_player;

alter table public.matches
  add constraint matches_joker_requires_player
  check ((joker_enabled = false) or (joker_player_id is not null));
