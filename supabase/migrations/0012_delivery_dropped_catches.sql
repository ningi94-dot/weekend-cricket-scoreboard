-- Let's Play Cricket: track dropped catches as fielding events on deliveries.

alter table public.deliveries
  add column if not exists catch_dropped boolean not null default false,
  add column if not exists catch_drop_fielder_id uuid references public.players(id) on delete set null;

create index if not exists deliveries_catch_drop_fielder_id_idx
  on public.deliveries(catch_drop_fielder_id)
  where catch_drop_fielder_id is not null;
