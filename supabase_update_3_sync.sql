-- ═══════════════════════════════════════════════════════════════
--  SENTIRE — UPDATE 3: shared live data for every user and workstation
--  Run ONCE in Supabase → SQL Editor (after supabase_setup.sql and update 2).
--  Safe to run again.
-- ═══════════════════════════════════════════════════════════════

-- One row per data list (orders, clients, jobs, stock ...). "version" goes up by 1 on every save,
-- so two people saving at the same moment are detected and merged instead of one overwriting the other.
create table if not exists public.kv_store (
  key        text primary key check (key ~ '^[a-z0-9_]{1,60}$'),
  value      jsonb not null,
  version    bigint not null default 1,
  updated_at timestamptz not null default now(),
  updated_by text
);

alter table public.kv_store enable row level security;

-- Logged-in members of this business can READ. Nobody can write directly; writes go through kv_put below.
drop policy if exists kv_read on public.kv_store;
create policy kv_read on public.kv_store for select to authenticated using ((select public.is_member()));
revoke all on public.kv_store from anon, public;
revoke insert, update, delete, truncate on public.kv_store from authenticated;
grant select on public.kv_store to authenticated;

-- Save one list. p_base is the version the caller last saw (0 for a new list).
-- If someone else saved in between, nothing is written and the newest copy is handed back to be merged.
-- Only the Admin may make a list SHORTER (that is what deleting does).
create or replace function public.kv_put(p_key text, p_value jsonb, p_base bigint)
returns json language plpgsql security definer set search_path = '' as $$
declare
  cur  public.kv_store;
  me   text;
  oldn bigint;
  newn bigint;
begin
  if not public.is_member() then raise exception 'Not allowed.'; end if;
  if p_key is null or p_key !~ '^[a-z0-9_]{1,60}$' then raise exception 'Bad name.'; end if;
  if p_value is null then raise exception 'Nothing to save.'; end if;
  select name into me from public.profiles where user_id = (select auth.uid());

  select * into cur from public.kv_store where key = p_key for update;
  if not found then
    insert into public.kv_store(key, value, version, updated_by) values (p_key, p_value, 1, me)
      on conflict (key) do nothing;
    if found then return json_build_object('ok', true, 'version', 1); end if;
    select * into cur from public.kv_store where key = p_key for update;
  end if;

  if cur.version <> coalesce(p_base, 0) then
    return json_build_object('ok', false, 'version', cur.version, 'value', cur.value);
  end if;

  if not public.is_admin() and jsonb_typeof(cur.value) = jsonb_typeof(p_value) then
    if jsonb_typeof(cur.value) = 'array' then
      oldn := jsonb_array_length(cur.value); newn := jsonb_array_length(p_value);
    elsif jsonb_typeof(cur.value) = 'object' then
      select count(*) into oldn from jsonb_object_keys(cur.value);
      select count(*) into newn from jsonb_object_keys(p_value);
    end if;
    if oldn is not null and newn < oldn then raise exception 'Only the Admin can delete.'; end if;
  end if;

  update public.kv_store
     set value = p_value, version = cur.version + 1, updated_at = now(), updated_by = me
   where key = p_key;
  return json_build_object('ok', true, 'version', cur.version + 1);
end $$;

revoke all on function public.kv_put(text, jsonb, bigint) from public, anon;
grant execute on function public.kv_put(text, jsonb, bigint) to authenticated;

-- Live refresh: tell every open screen when a list changes.
do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'kv_store') then
    alter publication supabase_realtime add table public.kv_store;
  end if;
end $$;
