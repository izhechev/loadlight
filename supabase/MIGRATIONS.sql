-- LoadLight — pending production migrations
-- Run the required blocks in the Supabase SQL editor (Dashboard → SQL Editor).
-- The blocks can also be rerun together.
-- The app degrades gracefully while these are pending, but new recurrence
-- features (every-N-days, monthly, yearly) only persist after they run.

-- ── 2026-07-04: every-N-days cadence ────────────────────────────────────────
alter table tasks add column if not exists recurring_days integer;

-- ── 2026-07-05: monthly + yearly cadences (birthdays, bills) ────────────────
alter table tasks drop constraint if exists tasks_recurring_check,
  add constraint tasks_recurring_check
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

-- Store a task's checklist on its parent so a breakdown is one write.
alter table public.tasks add column if not exists steps jsonb not null default '[]'::jsonb;

-- Complete one occurrence and create the next in the same transaction.
create or replace function public.complete_recurring_task(task_id uuid, next_deadline timestamptz)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  original public.tasks;
begin
  update public.tasks set status = 'completed', completed_at = now()
    where id = task_id and user_id = auth.uid() and status = 'active' and recurring <> 'none'
    returning * into original;
  if not found then return; end if;
  if next_deadline is null or next_deadline <= original.deadline then
    raise exception 'Next occurrence must follow the current deadline';
  end if;
  if not exists (
    select 1 from public.tasks where user_id = original.user_id and name = original.name
      and category = original.category and recurring = original.recurring
      and status <> 'archived' and deadline = next_deadline
  ) then
    insert into public.tasks (user_id, name, category, life_domain, demand_type, difficulty, priority,
      deadline, estimated_minutes, notes, recurring, recurring_hours, recurring_days, steps)
    values (original.user_id, original.name, original.category, original.life_domain, original.demand_type,
      original.difficulty, original.priority, next_deadline, original.estimated_minutes, original.notes,
      original.recurring, original.recurring_hours, original.recurring_days,
      coalesce((select jsonb_agg(step || '{"done":false}'::jsonb order by position)
        from jsonb_array_elements(original.steps) with ordinality s(step, position)), '[]'::jsonb));
  end if;
end;
$$;
revoke all on function public.complete_recurring_task(uuid, timestamptz) from public, anon;
grant execute on function public.complete_recurring_task(uuid, timestamptz) to authenticated;

alter table public.tasks
  add column if not exists actual_minutes integer check (actual_minutes between 1 and 10080);
