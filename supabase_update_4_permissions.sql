-- ═══════════════════════════════════════════════════════════════
--  SENTIRE — UPDATE 4: who may APPROVE and who may DELETE
--  Run ONCE in Supabase → SQL Editor (after update 3). Safe to run again.
--  Admin: always both.  Sub Admin: both (tick both boxes).  Approver (e.g. "User 10"): approve only.
--  Everyone else: neither — they take orders and enter data.
-- ═══════════════════════════════════════════════════════════════
alter table public.profiles add column if not exists can_delete  boolean not null default false;
alter table public.profiles add column if not exists can_approve boolean not null default false;

create or replace function public.can_delete() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select role = 'Admin' or can_delete from public.profiles where user_id = (select auth.uid())), false);
$$;

create or replace function public.my_profile() returns json
language sql stable security definer set search_path = '' as $$
  select json_build_object('login_id', login_id, 'name', name, 'role', role, 'apps', apps,
                           'can_delete', (role = 'Admin' or can_delete), 'can_approve', (role = 'Admin' or can_approve))
    from public.profiles where user_id = (select auth.uid());
$$;

drop function if exists public.admin_list_users();
create function public.admin_list_users()
returns table (user_id uuid, login_id text, name text, role text, apps text[], can_delete boolean, can_approve boolean)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'Only the Admin can do this.'; end if;
  return query select p.user_id, p.login_id, p.name, p.role, p.apps, p.can_delete, p.can_approve from public.profiles p
               order by (p.role = 'Admin') desc, p.created_at;
end $$;

create or replace function public.admin_set_perms(p_user_id uuid, p_can_delete boolean, p_can_approve boolean) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'Only the Admin can do this.'; end if;
  if not exists (select 1 from public.profiles where user_id = p_user_id) then raise exception 'That login no longer exists.'; end if;
  if exists (select 1 from public.profiles where user_id = p_user_id and role = 'Admin') then raise exception 'The Admin always has every right.'; end if;
  update public.profiles set can_delete = coalesce(p_can_delete, false), can_approve = coalesce(p_can_approve, false) where user_id = p_user_id;
end $$;

-- Saving data: only people who may delete can make a list shorter.
create or replace function public.kv_put(p_key text, p_value jsonb, p_base bigint)
returns json language plpgsql security definer set search_path = '' as $$
declare cur public.kv_store; me text; oldn bigint; newn bigint;
begin
  if not public.is_member() then raise exception 'Not allowed.'; end if;
  if p_key is null or p_key !~ '^[a-z0-9_]{1,60}$' then raise exception 'Bad name.'; end if;
  if p_value is null then raise exception 'Nothing to save.'; end if;
  select name into me from public.profiles where user_id = (select auth.uid());
  select * into cur from public.kv_store where key = p_key for update;
  if not found then
    insert into public.kv_store(key, value, version, updated_by) values (p_key, p_value, 1, me) on conflict (key) do nothing;
    if found then return json_build_object('ok', true, 'version', 1); end if;
    select * into cur from public.kv_store where key = p_key for update;
  end if;
  if cur.version <> coalesce(p_base, 0) then
    return json_build_object('ok', false, 'version', cur.version, 'value', cur.value);
  end if;
  if not public.can_delete() and jsonb_typeof(cur.value) = jsonb_typeof(p_value) then
    if jsonb_typeof(cur.value) = 'array' then oldn := jsonb_array_length(cur.value); newn := jsonb_array_length(p_value);
    elsif jsonb_typeof(cur.value) = 'object' then
      select count(*) into oldn from jsonb_object_keys(cur.value); select count(*) into newn from jsonb_object_keys(p_value);
    end if;
    if oldn is not null and newn < oldn then raise exception 'Only the Admin or Sub Admin can delete.'; end if;
  end if;
  update public.kv_store set value = p_value, version = cur.version + 1, updated_at = now(), updated_by = me where key = p_key;
  return json_build_object('ok', true, 'version', cur.version + 1);
end $$;

revoke all on function public.can_delete()                              from public, anon;
revoke all on function public.my_profile()                              from public, anon;
revoke all on function public.admin_list_users()                        from public, anon;
revoke all on function public.admin_set_perms(uuid, boolean, boolean)   from public, anon;
revoke all on function public.kv_put(text, jsonb, bigint)               from public, anon;
grant execute on function public.can_delete()                              to authenticated;
grant execute on function public.my_profile()                              to authenticated;
grant execute on function public.admin_list_users()                        to authenticated;
grant execute on function public.admin_set_perms(uuid, boolean, boolean)   to authenticated;
grant execute on function public.kv_put(text, jsonb, bigint)               to authenticated;
