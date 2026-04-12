/**
 * Drizzle schema — used for TypeScript type inference only.
 * Apply to Supabase via the SQL below in the dashboard SQL editor.
 * Runtime queries use the Supabase JS client, not a Drizzle connection.
 */
import {
  pgTable, uuid, text, integer, boolean, timestamp, real,
} from 'drizzle-orm/pg-core'

// ─────────────────────────────────────────────
// profiles
// ─────────────────────────────────────────────
export const profiles = pgTable('profiles', {
  id:                 uuid('id').primaryKey(),
  balanceMode:        text('balance_mode').notNull().default('average'),
  modeLockUntil:      timestamp('mode_locked_until', { withTimezone: true }),
  onboardingComplete: boolean('onboarding_complete').notNull().default(false),
  createdAt:          timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

// ─────────────────────────────────────────────
// tasks
// ─────────────────────────────────────────────
export const tasks = pgTable('tasks', {
  id:               uuid('id').primaryKey().defaultRandom(),
  userId:           uuid('user_id').notNull(),
  name:             text('name').notNull(),
  category:         text('category').notNull().default('Personal'),
  lifeDomain:       text('life_domain').notNull().default('personal'),
  demandType:       text('demand_type').notNull().default('routine'),
  difficulty:       integer('difficulty').notNull().default(2),
  priority:         integer('priority').notNull().default(3),
  deadline:         timestamp('deadline', { withTimezone: true }),
  startDate:        timestamp('start_date', { withTimezone: true }),
  estimatedMinutes: integer('estimated_minutes'),
  notes:            text('notes').notNull().default(''),
  status:           text('status').notNull().default('active'),  // active | completed | archived
  recurring:        text('recurring').notNull().default('none'), // none | daily | weekly
  recurringHours:   integer('recurring_hours'),
  snoozedUntil:     timestamp('snoozed_until', { withTimezone: true }),
  createdAt:        timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  completedAt:      timestamp('completed_at', { withTimezone: true }),
})

// ─────────────────────────────────────────────
// state_snapshots
// ─────────────────────────────────────────────
export const stateSnapshots = pgTable('state_snapshots', {
  id:                  uuid('id').primaryKey().defaultRandom(),
  userId:              uuid('user_id').notNull(),
  compositeScore:      real('composite_score').notNull(),
  taskAccumulation:    real('task_accumulation').notNull(),
  demandConcentration: real('demand_concentration').notNull(),
  completionVelocity:  real('completion_velocity').notNull(),
  temporalPressure:    real('temporal_pressure').notNull(),
  selfReport:          real('self_report').notNull(),
  state:               text('state').notNull(),
  recordedAt:          timestamp('recorded_at', { withTimezone: true }).notNull().defaultNow(),
})

// ─────────────────────────────────────────────
// overwhelm_events
// ─────────────────────────────────────────────
export const overwhelmEvents = pgTable('overwhelm_events', {
  id:            uuid('id').primaryKey().defaultRandom(),
  userId:        uuid('user_id').notNull(),
  trigger:       text('trigger').notNull(),        // composite | button
  previousState: text('previous_state').notNull(),
  newState:      text('new_state').notNull(),
  createdAt:     timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

// ─────────────────────────────────────────────
// ai_logs  (metadata only — never store input/output text)
// ─────────────────────────────────────────────
export const aiLogs = pgTable('ai_logs', {
  id:        uuid('id').primaryKey().defaultRandom(),
  userId:    uuid('user_id').notNull(),
  callType:  text('call_type').notNull(),   // extraction | advisory
  model:     text('model').notNull(),
  tokensIn:  integer('tokens_in').notNull(),
  tokensOut: integer('tokens_out').notNull(),
  latencyMs: integer('latency_ms').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

// ─────────────────────────────────────────────
// TypeScript inferred types
// ─────────────────────────────────────────────
export type Profile         = typeof profiles.$inferSelect
export type NewProfile      = typeof profiles.$inferInsert
export type DbTask          = typeof tasks.$inferSelect
export type NewDbTask       = typeof tasks.$inferInsert
export type StateSnapshot   = typeof stateSnapshots.$inferSelect
export type NewStateSnapshot = typeof stateSnapshots.$inferInsert
export type OverwhelmEvent  = typeof overwhelmEvents.$inferSelect
export type AiLog           = typeof aiLogs.$inferSelect

/*
──────────────────────────────────────────────────────────────────
SQL MIGRATION — run in Supabase dashboard > SQL Editor
──────────────────────────────────────────────────────────────────

create table profiles (
  id                  uuid primary key references auth.users on delete cascade,
  balance_mode        text check (balance_mode in ('beast','average','chill')) not null default 'average',
  mode_locked_until   timestamptz,
  onboarding_complete boolean not null default false,
  created_at          timestamptz not null default now()
);
alter table profiles enable row level security;
create policy "own profile" on profiles for all using (auth.uid() = id);

create table tasks (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid references profiles(id) on delete cascade not null,
  name              text not null,
  category          text not null default 'Personal',
  life_domain       text not null default 'personal',
  demand_type       text not null default 'routine',
  difficulty        integer not null default 2 check (difficulty between 1 and 5),
  priority          integer not null default 3 check (priority between 1 and 4),
  deadline          timestamptz,
  start_date        timestamptz,
  estimated_minutes integer,
  notes             text not null default '',
  status            text not null default 'active' check (status in ('active','completed','archived')),
  recurring         text not null default 'none' check (recurring in ('none','daily','weekly')),
  recurring_hours   integer,
  snoozed_until     timestamptz,
  created_at        timestamptz not null default now(),
  completed_at      timestamptz
);
alter table tasks enable row level security;
create policy "own tasks" on tasks for all using (auth.uid() = user_id);

create table state_snapshots (
  id                   uuid primary key default gen_random_uuid(),
  user_id              uuid references profiles(id) on delete cascade not null,
  composite_score      real not null,
  task_accumulation    real not null,
  demand_concentration real not null,
  completion_velocity  real not null,
  temporal_pressure    real not null,
  self_report          real not null,
  state                text check (state in ('normal','elevated','overwhelmed')) not null,
  recorded_at          timestamptz not null default now()
);
alter table state_snapshots enable row level security;
create policy "own snapshots" on state_snapshots for all using (auth.uid() = user_id);

create table overwhelm_events (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid references profiles(id) on delete cascade not null,
  trigger         text check (trigger in ('composite','button')) not null,
  previous_state  text not null,
  new_state       text not null,
  created_at      timestamptz not null default now()
);
alter table overwhelm_events enable row level security;
create policy "own events" on overwhelm_events for all using (auth.uid() = user_id);

create table ai_logs (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references profiles(id) on delete cascade not null,
  call_type   text check (call_type in ('extraction','advisory')) not null,
  model       text not null,
  tokens_in   integer not null,
  tokens_out  integer not null,
  latency_ms  integer not null,
  created_at  timestamptz not null default now()
);
alter table ai_logs enable row level security;
create policy "own ai_logs" on ai_logs for all using (auth.uid() = user_id);

──────────────────────────────────────────────────────────────────
*/
