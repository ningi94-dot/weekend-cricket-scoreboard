-- Restrict team selection edits to the server-side captain workflow.
-- Public visitors can still view squads, but anonymous users can no longer
-- insert, update, or delete match_squads directly from the browser.

revoke insert, update, delete on public.match_squads from anon;

drop policy if exists "Demo users can manage match squads" on public.match_squads;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'match_squads' and policyname = 'Demo users can view squads'
  ) then
    create policy "Demo users can view squads" on public.match_squads
    for select to anon using (true);
  end if;
end $$;
