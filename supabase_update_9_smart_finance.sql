-- ═══════════════════════════════════════════════════════════════
--  SENTIRE — UPDATE 9: Smart Finance data is for the Admin and Sub Admin only
--  Run ONCE in Supabase → SQL Editor (after updates 3 and 7). Safe to run again.
--  Smart Finance keeps its data in kv_store under names starting "sfin_"
--  (bank entries, bank balances, opening balances, party rules).
--  After this update nobody else can read or write those rows — not even an approver ("User 10").
-- ═══════════════════════════════════════════════════════════════

-- READ: members read the shared lists as before; Admin-section rows (sfin_…, lc_batches) only the Admin / Sub Admin.
drop policy if exists kv_read on public.kv_store;
create policy kv_read on public.kv_store for select to authenticated
  using ((select public.is_member()) and (key !~ '^(sfin_|lc_batches$)' or (select public.is_security_admin())));

-- WRITE: every save goes through kv_put; this guard stops a save to an sfin_ row by anyone else.
create or replace function public.kv_guard_private()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.key ~ '^(sfin_|lc_batches$)' and not public.is_security_admin() then
    raise exception 'Only the Admin or Sub Admin can use the Admin section.';
  end if;
  return new;
end $$;
revoke all on function public.kv_guard_private() from public, anon, authenticated;

drop trigger if exists kv_guard_private on public.kv_store;
create trigger kv_guard_private before insert or update on public.kv_store
  for each row execute function public.kv_guard_private();
