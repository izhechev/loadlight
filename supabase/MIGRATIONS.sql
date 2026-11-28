-- LoadLight — pending production migrations
-- Run each block ONCE in the Supabase SQL editor (Dashboard → SQL Editor).
-- Blocks are ordered; already-applied blocks fail harmlessly ("already exists").
-- The app degrades gracefully while these are pending, but new recurrence
-- features (every-N-days, monthly, yearly) only persist after they run.

-- ── 2026-07-04: every-N-days cadence ────────────────────────────────────────
alter table tasks add column recurring_days integer;

-- ── 2026-07-05: monthly + yearly cadences (birthdays, bills) ────────────────
alter table tasks drop constraint tasks_recurring_check;
alter table tasks add constraint tasks_recurring_check
  check (recurring in ('none','daily','weekly','monthly','yearly'));

-- Shared account quota for all routes that use the Gemini API.
begin;

create schema if not exists loadlight_private;

create table if not exists loadlight_private.ai_quota (
  user_id uuid primary key references auth.users (id) on delete cascade,
  started_at timestamptz not null,
  request_count integer not null check (request_count > 0)
);

alter table loadlight_private.ai_quota enable row level security;
revoke all on loadlight_private.ai_quota from public, anon, authenticated;

create or replace function loadlight_private.consume_ai_quota()
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
  request_time timestamptz := pg_catalog.now();
  is_allowed boolean;
begin
  if caller_id is null or auth.jwt()->>'is_anonymous' = 'true' then
    return false;
  end if;

  insert into loadlight_private.ai_quota as quota (user_id, started_at, request_count)
  values (caller_id, request_time, 1)
  on conflict (user_id) do update
    set started_at = case
          when quota.started_at + interval '10 minutes' <= excluded.started_at then excluded.started_at
          else quota.started_at
        end,
        request_count = case
          when quota.started_at + interval '10 minutes' <= excluded.started_at then 1
          else quota.request_count + 1
        end
  where quota.started_at + interval '10 minutes' <= excluded.started_at or quota.request_count < 20
  returning true into is_allowed;

  return coalesce(is_allowed, false);
end;
$$;

create or replace function public.consume_ai_quota()
returns boolean
language sql
security invoker
set search_path = ''
as $$
  select loadlight_private.consume_ai_quota();
$$;

revoke execute on function loadlight_private.consume_ai_quota() from public, anon, authenticated;
revoke execute on function public.consume_ai_quota() from public, anon, authenticated;
grant usage on schema loadlight_private to authenticated;
grant execute on function loadlight_private.consume_ai_quota() to authenticated;
grant execute on function public.consume_ai_quota() to authenticated;

commit;
