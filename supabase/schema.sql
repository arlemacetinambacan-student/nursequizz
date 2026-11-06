-- Run this once in Supabase: SQL Editor → New query → Paste → Run

create table if not exists public.submissions (
  id text primary key,
  student_name text not null,
  student_name_key text not null unique,
  section text not null,
  date text,
  started_at timestamptz,
  submitted_at timestamptz,
  tab_switches integer default 0,
  auto_submitted boolean default false,
  answers jsonb default '{}'::jsonb,
  grades jsonb default '{}'::jsonb,
  total_score integer default 0,
  graded boolean default false,
  teacher_notes text default '',
  graded_by text,
  graded_at timestamptz,
  created_at timestamptz default now()
);

create index if not exists submissions_submitted_at_idx
  on public.submissions (submitted_at desc);

alter table public.submissions enable row level security;

-- No public policies on purpose.
-- The server uses the Service Role key (bypasses RLS).
-- Students never talk to Supabase directly from the browser.

grant all on table public.submissions to service_role;
