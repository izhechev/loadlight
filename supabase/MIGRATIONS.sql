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
