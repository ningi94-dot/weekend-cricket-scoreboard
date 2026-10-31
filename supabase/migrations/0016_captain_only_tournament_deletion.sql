-- Tournament deletion must go through the server-side captain-protected API.
-- Public users may still create and edit tournaments during the current demo phase.

revoke delete on public.tournaments from anon, authenticated;

drop policy if exists "Demo users can manage tournaments" on public.tournaments;
drop policy if exists "Authenticated users can manage tournaments" on public.tournaments;
drop policy if exists "Demo users can create tournaments" on public.tournaments;
drop policy if exists "Demo users can update tournaments" on public.tournaments;
drop policy if exists "Authenticated users can create tournaments" on public.tournaments;
drop policy if exists "Authenticated users can update tournaments" on public.tournaments;

create policy "Demo users can create tournaments" on public.tournaments
for insert to anon with check (true);

create policy "Demo users can update tournaments" on public.tournaments
for update to anon using (true) with check (true);

create policy "Authenticated users can create tournaments" on public.tournaments
for insert to authenticated with check (true);

create policy "Authenticated users can update tournaments" on public.tournaments
for update to authenticated using (true) with check (true);
