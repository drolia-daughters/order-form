-- Fixed user slots: "User 10" always stays in slot 10.
alter table public.profiles add column if not exists slot int check (slot between 1 and 10);
create unique index if not exists profiles_slot_uq on public.profiles(slot) where slot is not null;

create or replace function public.admin_slots() returns table (user_id uuid, slot int)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'Only the Admin can do this.'; end if;
  return query select p.user_id, p.slot from public.profiles p where p.slot is not null;
end $$;

create or replace function public.admin_set_slot(p_user_id uuid, p_slot int) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'Only the Admin can do this.'; end if;
  update public.profiles set slot = p_slot where user_id = p_user_id and role <> 'Admin';
end $$;

revoke all on function public.admin_slots() from public, anon;
revoke all on function public.admin_set_slot(uuid, int) from public, anon;
grant execute on function public.admin_slots() to authenticated;
grant execute on function public.admin_set_slot(uuid, int) to authenticated;

-- existing logins keep their present places
update public.profiles set slot = 2 where login_id = 'sa01' and slot is null;
update public.profiles set slot = 3 where login_id = 'kh01' and slot is null;
