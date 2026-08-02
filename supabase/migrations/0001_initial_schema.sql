-- Weekend Cricket Scoreboard: initial shared-data schema.
-- Run this entire file in Supabase Dashboard > SQL Editor > New query.

create extension if not exists "pgcrypto";

create type public.app_role as enum ('admin', 'captain', 'player');
create type public.match_status as enum ('upcoming', 'live', 'completed');
create type public.innings_status as enum ('not_started', 'in_progress', 'completed');
create type public.dismissal_kind as enum ('bowled', 'caught', 'lbw', 'run_out', 'stumped', 'hit_wicket', 'retired_hurt', 'retired_out', 'obstructing_field', 'timed_out');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default 'Cricket player',
  email text,
  role public.app_role not null default 'player',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.players (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid unique references public.profiles(id) on delete set null,
  name text not null check (char_length(trim(name)) between 1 and 100),
  batting_style text not null check (batting_style in ('right_hand', 'left_hand')),
  bowling_style text not null check (bowling_style in ('right_arm_pace', 'left_arm_pace', 'right_arm_off_spin', 'left_arm_orthodox', 'leg_spin', 'none')),
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.matches (
  id uuid primary key default gen_random_uuid(),
  team_a_name text not null check (char_length(trim(team_a_name)) between 1 and 100),
  team_b_name text not null check (char_length(trim(team_b_name)) between 1 and 100),
  match_date date not null,
  location text not null check (char_length(trim(location)) between 1 and 200),
  overs_per_innings smallint not null check (overs_per_innings between 1 and 100),
  status public.match_status not null default 'upcoming',
  toss_winner text,
  toss_decision text check (toss_decision in ('bat', 'bowl')),
  winner text,
  player_of_match_id uuid references public.players(id) on delete set null,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((toss_winner is null and toss_decision is null) or (toss_winner is not null and toss_decision is not null))
);

create table public.match_squads (
  match_id uuid not null references public.matches(id) on delete cascade,
  player_id uuid not null references public.players(id) on delete restrict,
  team_side text not null check (team_side in ('a', 'b')),
  is_captain boolean not null default false,
  primary key (match_id, player_id)
);

create table public.innings (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.matches(id) on delete cascade,
  batting_team_side text not null check (batting_team_side in ('a', 'b')),
  innings_number smallint not null check (innings_number between 1 and 4),
  status public.innings_status not null default 'not_started',
  target_runs integer check (target_runs > 0),
  started_at timestamptz,
  completed_at timestamptz,
  unique (match_id, innings_number),
  unique (match_id, batting_team_side)
);

-- Every legal or illegal delivery is saved here. Totals and career statistics
-- will be calculated from these records, never stored as an editable source of truth.
create table public.deliveries (
  id uuid primary key default gen_random_uuid(),
  innings_id uuid not null references public.innings(id) on delete cascade,
  sequence_number integer not null check (sequence_number > 0),
  over_number smallint not null check (over_number >= 0),
  ball_in_over smallint not null check (ball_in_over between 1 and 6),
  striker_id uuid not null references public.players(id) on delete restrict,
  non_striker_id uuid not null references public.players(id) on delete restrict,
  bowler_id uuid not null references public.players(id) on delete restrict,
  batter_runs smallint not null default 0 check (batter_runs between 0 and 6),
  wide_runs smallint not null default 0 check (wide_runs between 0 and 10),
  no_ball_runs smallint not null default 0 check (no_ball_runs between 0 and 10),
  bye_runs smallint not null default 0 check (bye_runs between 0 and 10),
  leg_bye_runs smallint not null default 0 check (leg_bye_runs between 0 and 10),
  penalty_runs smallint not null default 0 check (penalty_runs between 0 and 10),
  is_wicket boolean not null default false,
  dismissed_player_id uuid references public.players(id) on delete restrict,
  dismissal public.dismissal_kind,
  is_legal_delivery boolean generated always as (wide_runs = 0 and no_ball_runs = 0) stored,
  recorded_by uuid not null references public.profiles(id),
  recorded_at timestamptz not null default now(),
  unique (innings_id, sequence_number),
  check ((is_wicket = false and dismissed_player_id is null and dismissal is null) or (is_wicket = true and dismissed_player_id is not null and dismissal is not null))
);

create index deliveries_innings_sequence_idx on public.deliveries (innings_id, sequence_number);
create index match_squads_match_id_idx on public.match_squads (match_id);
create index matches_match_date_idx on public.matches (match_date desc);

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_set_updated_at before update on public.profiles for each row execute function public.set_updated_at();
create trigger players_set_updated_at before update on public.players for each row execute function public.set_updated_at();
create trigger matches_set_updated_at before update on public.matches for each row execute function public.set_updated_at();

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, display_name, email)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', split_part(new.email, '@', 1), 'Cricket player'),
    new.email
  );
  return new;
end;
$$;

create trigger on_auth_user_created after insert on auth.users for each row execute procedure public.handle_new_user();

create or replace function public.is_captain_or_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role in ('admin', 'captain')
  );
$$;

grant usage on schema public to authenticated;
grant select on public.profiles, public.players, public.matches, public.match_squads, public.innings, public.deliveries to authenticated;
grant insert, update, delete on public.players, public.matches, public.match_squads, public.innings, public.deliveries to authenticated;

alter table public.profiles enable row level security;
alter table public.players enable row level security;
alter table public.matches enable row level security;
alter table public.match_squads enable row level security;
alter table public.innings enable row level security;
alter table public.deliveries enable row level security;

create policy "Authenticated users can view profiles" on public.profiles for select to authenticated using (true);
create policy "Users can update their own profile" on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

create policy "Authenticated users can view players" on public.players for select to authenticated using (true);
create policy "Captains and admins manage players" on public.players for all to authenticated using (public.is_captain_or_admin()) with check (public.is_captain_or_admin());
create policy "Authenticated users can view matches" on public.matches for select to authenticated using (true);
create policy "Captains and admins manage matches" on public.matches for all to authenticated using (public.is_captain_or_admin()) with check (public.is_captain_or_admin());
create policy "Authenticated users can view squads" on public.match_squads for select to authenticated using (true);
create policy "Captains and admins manage squads" on public.match_squads for all to authenticated using (public.is_captain_or_admin()) with check (public.is_captain_or_admin());
create policy "Authenticated users can view innings" on public.innings for select to authenticated using (true);
create policy "Captains and admins manage innings" on public.innings for all to authenticated using (public.is_captain_or_admin()) with check (public.is_captain_or_admin());
create policy "Authenticated users can view deliveries" on public.deliveries for select to authenticated using (true);
create policy "Captains and admins manage deliveries" on public.deliveries for all to authenticated using (public.is_captain_or_admin()) with check (public.is_captain_or_admin());

-- After you sign into the app for the first time, run this once in SQL Editor,
-- replacing the email address with your own. This gives you administrator access.
-- update public.profiles set role = 'admin' where email = 'you@example.com';
