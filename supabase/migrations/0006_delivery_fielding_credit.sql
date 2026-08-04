-- Add fielding credit for dismissals such as catches, stumpings, and run outs.
-- This keeps fielding statistics derivable from ball-by-ball delivery records.

alter table public.deliveries
  add column if not exists fielder_id uuid references public.players(id) on delete set null;
