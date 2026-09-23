-- Speeds up match-center and scoring queries that load innings for one match.
create index if not exists innings_match_id_idx
  on public.innings (match_id);
