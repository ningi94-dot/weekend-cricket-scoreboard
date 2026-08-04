-- Let's Play Cricket: match center, public scorecards, and protected scoring support.
-- Run this in Supabase SQL Editor after the previous migrations.

alter table public.innings
  add column if not exists striker_id uuid references public.players(id) on delete set null,
  add column if not exists non_striker_id uuid references public.players(id) on delete set null,
  add column if not exists bowler_id uuid references public.players(id) on delete set null;

alter table public.matches
  add column if not exists start_time time,
  add column if not exists started_at timestamptz,
  add column if not exists is_test boolean not null default false;

alter table public.deliveries
  alter column recorded_by drop not null;

grant usage on schema public to anon;
grant select on public.players, public.matches, public.match_squads, public.innings, public.deliveries to anon;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'match_squads' and policyname = 'Demo users can view squads'
  ) then
    create policy "Demo users can view squads" on public.match_squads
    for select to anon using (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'innings' and policyname = 'Demo users can view innings'
  ) then
    create policy "Demo users can view innings" on public.innings
    for select to anon using (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'deliveries' and policyname = 'Demo users can view deliveries'
  ) then
    create policy "Demo users can view deliveries" on public.deliveries
    for select to anon using (true);
  end if;
end $$;
