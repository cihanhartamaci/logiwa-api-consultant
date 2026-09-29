-- AIntegration shared team learning KB
-- Run once in the Supabase SQL editor.
-- Replace YOUR_TEAM_WRITE_SECRET below with the same value as VITE_TEAM_WRITE_SECRET.

create extension if not exists "pgcrypto";

create table if not exists public.answer_feedback (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  rating text not null check (rating in ('up', 'down')),
  question_text text not null default '',
  answer_text text not null default '',
  correction_text text,
  provider text,
  client_id text not null default ''
);

create table if not exists public.knowledge_entries (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  topic text not null,
  content text not null,
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected')),
  source text not null default 'teach'
    check (source in ('teach', 'correction', 'proposeLearnedKnowledge')),
  feedback_id uuid references public.answer_feedback (id) on delete set null,
  upvotes int not null default 0,
  downvotes int not null default 0
);

create index if not exists knowledge_entries_status_idx
  on public.knowledge_entries (status, updated_at desc);

create index if not exists answer_feedback_created_idx
  on public.answer_feedback (created_at desc);

create or replace function public.set_knowledge_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists knowledge_entries_updated_at on public.knowledge_entries;
create trigger knowledge_entries_updated_at
  before update on public.knowledge_entries
  for each row execute function public.set_knowledge_updated_at();

-- Team write secret: MUST match VITE_TEAM_WRITE_SECRET in the SPA build.
create or replace function public.team_secret_ok(p_secret text)
returns boolean
language sql
immutable
as $$
  select p_secret is not null
    and length(p_secret) > 0
    and p_secret = 'YOUR_TEAM_WRITE_SECRET';
$$;

create or replace function public.manage_knowledge(
  p_secret text,
  p_action text,
  p_id uuid default null,
  p_topic text default null,
  p_content text default null,
  p_status text default null,
  p_source text default 'teach',
  p_feedback_id uuid default null
)
returns public.knowledge_entries
language plpgsql
security definer
set search_path = public
as $$
declare
  row public.knowledge_entries;
begin
  if not public.team_secret_ok(p_secret) then
    raise exception 'invalid team write secret';
  end if;

  if p_action = 'insert' then
    insert into public.knowledge_entries (topic, content, status, source, feedback_id)
    values (
      coalesce(p_topic, ''),
      coalesce(p_content, ''),
      coalesce(p_status, 'pending'),
      coalesce(p_source, 'teach'),
      p_feedback_id
    )
    returning * into row;
    return row;
  end if;

  if p_id is null then
    raise exception 'p_id required for %', p_action;
  end if;

  if p_action = 'approve' then
    update public.knowledge_entries
    set status = 'approved',
        topic = coalesce(nullif(p_topic, ''), topic),
        content = coalesce(nullif(p_content, ''), content)
    where id = p_id
    returning * into row;
  elsif p_action = 'reject' then
    update public.knowledge_entries
    set status = 'rejected'
    where id = p_id
    returning * into row;
  elsif p_action = 'update' then
    update public.knowledge_entries
    set topic = coalesce(nullif(p_topic, ''), topic),
        content = coalesce(nullif(p_content, ''), content),
        status = coalesce(nullif(p_status, ''), status)
    where id = p_id
    returning * into row;
  elsif p_action = 'delete' then
    delete from public.knowledge_entries where id = p_id returning * into row;
  else
    raise exception 'unknown action %', p_action;
  end if;

  if row.id is null then
    raise exception 'knowledge entry not found';
  end if;
  return row;
end;
$$;

grant usage on schema public to anon, authenticated;
grant select, insert on public.answer_feedback to anon, authenticated;
grant select, insert on public.knowledge_entries to anon, authenticated;
grant execute on function public.manage_knowledge to anon, authenticated;

alter table public.answer_feedback enable row level security;
alter table public.knowledge_entries enable row level security;

drop policy if exists answer_feedback_insert on public.answer_feedback;
create policy answer_feedback_insert on public.answer_feedback
  for insert to anon, authenticated with check (true);

drop policy if exists answer_feedback_select on public.answer_feedback;
create policy answer_feedback_select on public.answer_feedback
  for select to anon, authenticated using (true);

drop policy if exists knowledge_select on public.knowledge_entries;
create policy knowledge_select on public.knowledge_entries
  for select to anon, authenticated using (true);

drop policy if exists knowledge_insert_pending on public.knowledge_entries;
create policy knowledge_insert_pending on public.knowledge_entries
  for insert to anon, authenticated
  with check (status = 'pending');
