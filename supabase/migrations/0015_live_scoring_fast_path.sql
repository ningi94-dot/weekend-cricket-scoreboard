-- Return the small amount of innings history needed to validate and record the
-- next delivery. This avoids downloading every prior ball on each score entry.

create or replace function public.get_innings_live_state(p_innings_id uuid)
returns table (
  last_sequence_number integer,
  legal_balls integer,
  total_runs integer,
  dismissed_player_ids uuid[]
)
language sql
stable
set search_path = public
as $$
  select
    coalesce(max(delivery.sequence_number), 0)::integer as last_sequence_number,
    count(*) filter (where delivery.is_legal_delivery)::integer as legal_balls,
    coalesce(sum(
      delivery.batter_runs +
      delivery.wide_runs +
      delivery.no_ball_runs +
      delivery.bye_runs +
      delivery.leg_bye_runs +
      delivery.penalty_runs
    ), 0)::integer as total_runs,
    coalesce(
      array_agg(delivery.dismissed_player_id order by delivery.sequence_number)
        filter (where delivery.is_wicket and delivery.dismissed_player_id is not null),
      array[]::uuid[]
    ) as dismissed_player_ids
  from public.deliveries as delivery
  where delivery.innings_id = p_innings_id;
$$;

revoke all on function public.get_innings_live_state(uuid) from public, anon, authenticated;
grant execute on function public.get_innings_live_state(uuid) to service_role;
