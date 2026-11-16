-- SENTIRE — Supabase update 2: RIGHTS (which apps each user may open)
-- Run once in the SQL Editor, after supabase_setup.sql. Safe to run again.
alter table public.profiles add column if not exists apps text[];   -- empty (null) = all apps

create or replace function public.my_profile() returns json
language sql stable security definer set search_path = '' as $$
  select json_build_object('login_id', login_id, 'name', name, 'role', role, 'apps', apps)
    from public.profiles where user_id = (select auth.uid());
$$;

drop function if exists public.admin_list_users();
create function public.admin_list_users()
returns table (user_id uuid, login_id text, name text, role text, apps text[])
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'Only the Admin can do this.'; end if;
  return query select p.user_id, p.login_id, p.name, p.role, p.apps from public.profiles p
               order by (p.role = 'Admin') desc, p.created_at;
end $$;

create or replace function public.admin_set_apps(p_user_id uuid, p_apps text[]) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'Only the Admin can do this.'; end if;
  if not exists (select 1 from public.profiles where user_id = p_user_id) then
    raise exception 'That login no longer exists.';
  end if;
  if exists (select 1 from public.profiles where user_id = p_user_id and role = 'Admin') then
    raise exception 'The Admin always has every app.';
  end if;
  if exists (select 1 from unnest(coalesce(p_apps, '{}'::text[])) a where a !~ '^[a-z_]{1,40}\.html$') then
    raise exception 'Unknown app name.';
  end if;
  update public.profiles set apps = p_apps where user_id = p_user_id;
end $$;

revoke all on function public.my_profile()                 from public, anon;
revoke all on function public.admin_list_users()           from public, anon;
revoke all on function public.admin_set_apps(uuid, text[]) from public, anon;
grant execute on function public.my_profile()                 to authenticated;
grant execute on function public.admin_list_users()           to authenticated;
grant execute on function public.admin_set_apps(uuid, text[]) to authenticated;
