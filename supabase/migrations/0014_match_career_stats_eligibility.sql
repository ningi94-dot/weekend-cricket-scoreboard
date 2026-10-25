-- Keep exhibition/friendly matches in scorecards while excluding them from
-- aggregate player and tournament statistics when requested.
-- Existing matches remain eligible because the new column defaults to true.

alter table public.matches
  add column if not exists counts_toward_career_stats boolean not null default true;

alter table public.matches
  drop constraint if exists tournament_matches_count_toward_career_stats;

alter table public.matches
  add constraint tournament_matches_count_toward_career_stats
  check (tournament_id is null or counts_toward_career_stats = true);

comment on column public.matches.counts_toward_career_stats is
  'When false, the match remains fully scored and visible but is excluded from aggregate career and tournament statistics.';
