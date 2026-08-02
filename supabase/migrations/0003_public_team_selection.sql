-- TEMPORARY DEMO MODE: allow anyone with the website URL to manage match squads.

grant select, insert, update, delete on public.match_squads to anon;

create policy "Demo users can manage match squads" on public.match_squads
for all to anon using (true) with check (true);
