-- Let's Play Cricket: tournaments, active players, and innings support roles.

create extension if not exists "pgcrypto";

create table if not exists public.tournaments (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) between 1 and 120),
  start_date date,
  location text,
  status text not null default 'active' check (status in ('active', 'completed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.players
  add column if not exists is_active boolean not null default true;

alter table public.matches
  add column if not exists tournament_id uuid references public.tournaments(id) on delete set null;

alter table public.innings
  add column if not exists wicket_keeper_id uuid references public.players(id) on delete set null,
  add column if not exists umpire_id uuid references public.players(id) on delete set null;

create index if not exists tournaments_status_idx on public.tournaments (status, start_date desc);
create index if not exists matches_tournament_id_idx on public.matches (tournament_id);
create index if not exists players_is_active_idx on public.players (is_active, name);

drop trigger if exists tournaments_set_updated_at on public.tournaments;
create trigger tournaments_set_updated_at before update on public.tournaments for each row execute function public.set_updated_at();

grant select, insert, update, delete on public.tournaments to anon;
grant select, insert, update, delete on public.tournaments to authenticated;

alter table public.tournaments enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'tournaments' and policyname = 'Demo users can view tournaments'
  ) then
    create policy "Demo users can view tournaments" on public.tournaments
    for select to anon using (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'tournaments' and policyname = 'Demo users can manage tournaments'
  ) then
    create policy "Demo users can manage tournaments" on public.tournaments
    for all to anon using (true) with check (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'tournaments' and policyname = 'Authenticated users can view tournaments'
  ) then
    create policy "Authenticated users can view tournaments" on public.tournaments
    for select to authenticated using (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'tournaments' and policyname = 'Authenticated users can manage tournaments'
  ) then
    create policy "Authenticated users can manage tournaments" on public.tournaments
    for all to authenticated using (true) with check (true);
  end if;
end $$;
