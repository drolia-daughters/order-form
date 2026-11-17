-- Accounts (ACS): a login that may see order rates and bill details.
alter table public.profiles add column if not exists can_bill boolean not null default false;

create or replace function public.my_profile() returns json
language sql stable security definer set search_path = '' as $$
  select json_build_object('login_id', login_id, 'name', name, 'role', role, 'apps', apps,
                           'can_delete', (role = 'Admin' or can_delete), 'can_approve', (role = 'Admin' or can_approve),
                           'can_bill', (role = 'Admin' or can_bill))
    from public.profiles where user_id = (select auth.uid());
$$;

drop function if exists public.admin_list_users();
create function public.admin_list_users()
returns table (user_id uuid, login_id text, name text, role text, apps text[], can_delete boolean, can_approve boolean, can_bill boolean)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'Only the Admin can do this.'; end if;
  return query select p.user_id, p.login_id, p.name, p.role, p.apps, p.can_delete, p.can_approve, p.can_bill from public.profiles p
               order by (p.role = 'Admin') desc, p.created_at;
end $$;

create or replace function public.admin_set_bill(p_user_id uuid, p_can_bill boolean) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'Only the Admin can do this.'; end if;
  update public.profiles set can_bill = coalesce(p_can_bill, false) where user_id = p_user_id and role <> 'Admin';
end $$;

revoke all on function public.my_profile() from public, anon;
revoke all on function public.admin_list_users() from public, anon;
revoke all on function public.admin_set_bill(uuid, boolean) from public, anon;
grant execute on function public.my_profile() to authenticated;
grant execute on function public.admin_list_users() to authenticated;
grant execute on function public.admin_set_bill(uuid, boolean) to authenticated;
