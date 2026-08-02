-- TEMPORARY DEMO MODE: anyone with the site URL may view and edit Players and Matches.
-- Replace these policies with role-based policies before sharing beyond your trusted group.

alter table public.players alter column created_by drop not null;
alter table public.matches alter column created_by drop not null;

grant usage on schema public to anon;
grant select, insert, update, delete on public.players, public.matches to anon;

create policy "Demo users can manage players" on public.players
for all to anon using (true) with check (true);

create policy "Demo users can manage matches" on public.matches
for all to anon using (true) with check (true);
