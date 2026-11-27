-- Operational usage only. Questions, answers, IP addresses, and cricket data are never stored here.
create table if not exists public.ai_usage_monthly (
  month_start date primary key,
  request_count integer not null default 0 check (request_count >= 0),
  input_tokens bigint not null default 0 check (input_tokens >= 0),
  output_tokens bigint not null default 0 check (output_tokens >= 0),
  estimated_cost_micros bigint not null default 0 check (estimated_cost_micros >= 0),
  updated_at timestamptz not null default now()
);

create table if not exists public.ai_request_logs (
  id bigint generated always as identity primary key,
  occurred_at timestamptz not null default now(),
  status text not null check (status in ('success', 'error')),
  error_category text,
  duration_ms integer not null check (duration_ms >= 0),
  input_tokens integer not null default 0 check (input_tokens >= 0),
  output_tokens integer not null default 0 check (output_tokens >= 0),
  estimated_cost_micros bigint not null default 0 check (estimated_cost_micros >= 0)
);

alter table public.ai_usage_monthly enable row level security;
alter table public.ai_request_logs enable row level security;
revoke all on public.ai_usage_monthly, public.ai_request_logs from anon, authenticated;
grant select on public.ai_usage_monthly to service_role;
create index if not exists ai_request_logs_occurred_at_idx on public.ai_request_logs (occurred_at);

create or replace function public.record_ai_usage(
  p_status text,
  p_error_category text,
  p_duration_ms integer,
  p_input_tokens integer,
  p_output_tokens integer,
  p_estimated_cost_micros bigint
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  current_month date := date_trunc('month', now())::date;
begin
  delete from public.ai_request_logs where occurred_at < now() - interval '90 days';

  insert into public.ai_request_logs (status, error_category, duration_ms, input_tokens, output_tokens, estimated_cost_micros)
  values (p_status, p_error_category, greatest(p_duration_ms, 0), greatest(p_input_tokens, 0), greatest(p_output_tokens, 0), greatest(p_estimated_cost_micros, 0));

  if p_status = 'success' then
    insert into public.ai_usage_monthly (month_start, request_count, input_tokens, output_tokens, estimated_cost_micros)
    values (current_month, 1, greatest(p_input_tokens, 0), greatest(p_output_tokens, 0), greatest(p_estimated_cost_micros, 0))
    on conflict (month_start) do update set
      request_count = public.ai_usage_monthly.request_count + 1,
      input_tokens = public.ai_usage_monthly.input_tokens + excluded.input_tokens,
      output_tokens = public.ai_usage_monthly.output_tokens + excluded.output_tokens,
      estimated_cost_micros = public.ai_usage_monthly.estimated_cost_micros + excluded.estimated_cost_micros,
      updated_at = now();
  end if;
end;
$$;

revoke all on function public.record_ai_usage(text, text, integer, integer, integer, bigint) from public, anon, authenticated;
grant execute on function public.record_ai_usage(text, text, integer, integer, integer, bigint) to service_role;
