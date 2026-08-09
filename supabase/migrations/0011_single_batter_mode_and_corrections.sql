-- Let's Play Cricket: casual single-batter mode and score correction support.

alter table public.matches
  add column if not exists single_batter_mode boolean not null default false;

alter table public.deliveries
  alter column non_striker_id drop not null;

create index if not exists matches_single_batter_mode_idx
  on public.matches (single_batter_mode);
