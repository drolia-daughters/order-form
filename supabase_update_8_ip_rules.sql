-- ═══════════════════════════════════════════════════════════════
--  Update 8 — Two-device limit, saved / blocked internet addresses, Inter mode (19 Nov 2026)
--  Run once in the Supabase SQL Editor, after update 7.
--
--  • Nobody (Admin included) may be logged in on more than 2 devices at a time.
--    A login that has not been used for 7 days no longer counts (it is ended).
--  • ip_rules: internet addresses (IPs) the Admin / Sub Admin has saved by name
--    ("allowed") or blocked. A blocked address can never log in → "Error 2".
--  • Inter mode: when switched on, people may log in ONLY from saved addresses.
--    A new address gets "Error 2 — contact your Admin".
--
--  EMERGENCY (locked out by Inter mode): Supabase → SQL Editor → run
--      update public.security_settings set inter_mode = false;
-- ═══════════════════════════════════════════════════════════════

create table if not exists public.security_settings (
  id          int primary key default 1 check (id = 1),
  inter_mode  boolean not null default false,
  max_devices int not null default 2,
  changed_by  text,
  changed_at  timestamptz
);
insert into public.security_settings (id) values (1) on conflict (id) do nothing;
alter table public.security_settings enable row level security;
revoke all on public.security_settings from anon, authenticated;
grant select on public.security_settings to authenticated;
drop policy if exists ss_read on public.security_settings;
create policy ss_read on public.security_settings for select to authenticated using ((select public.is_security_admin()));

create table if not exists public.ip_rules (
  ip         text primary key,
  label      text,                                   -- e.g. "Office", "Brother Sydney"
  status     text not null check (status in ('allowed', 'blocked')),
  added_by   text,
  added_at   timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.ip_rules enable row level security;
revoke all on public.ip_rules from anon, authenticated;

-- Every internet address we know: saved / blocked ones, plus every address seen in the security log.
create or replace function public.admin_ip_list()
returns table (ip text, label text, status text, city text, region text, country text, last_seen timestamptz, logins text, tries int)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_security_admin() then raise exception 'Only the Admin or Sub Admin can do this.'; end if;
  return query
  with seen as (
    select l.ip, max(l.at) as last_seen, string_agg(distinct l.login_id, ', ') as logins, count(*)::int as tries,
           (array_agg(l.city order by l.at desc) filter (where l.country is not null))[1] as city,
           (array_agg(l.region order by l.at desc) filter (where l.country is not null))[1] as region,
           (array_agg(l.country order by l.at desc) filter (where l.country is not null))[1] as country
      from public.security_log l
     where coalesce(l.ip, '') <> '' and l.kind not in ('IP_SAVED', 'IP_BLOCKED_SET', 'IP_UNBLOCKED', 'IP_REMOVED', 'FORCED_LOGOUT')
     group by l.ip)
  select coalesce(r.ip, s.ip), r.label, coalesce(r.status, 'new'), s.city, s.region, s.country, s.last_seen, s.logins, coalesce(s.tries, 0)
    from public.ip_rules r full join seen s on s.ip = r.ip
   order by (r.status = 'blocked') desc nulls last, s.last_seen desc nulls last;
end $$;

-- Save an address by name (allowed), block it, or unblock it (back to allowed).
create or replace function public.admin_ip_set(p_ip text, p_label text, p_status text)
returns void language plpgsql security definer set search_path = '' as $$
declare me text; v_ip text := trim(p_ip); old text;
begin
  if not public.is_security_admin() then raise exception 'Only the Admin or Sub Admin can do this.'; end if;
  if v_ip = '' or v_ip !~ '^[0-9a-fA-F:.]{3,64}$' then raise exception 'That is not an internet address.'; end if;
  if p_status not in ('allowed', 'blocked') then raise exception 'Choose allowed or blocked.'; end if;
  select login_id into me from public.profiles where user_id = auth.uid();
  select status into old from public.ip_rules where ip = v_ip;
  insert into public.ip_rules (ip, label, status, added_by) values (v_ip, nullif(trim(p_label), ''), p_status, me)
  on conflict (ip) do update set label = coalesce(nullif(trim(p_label), ''), public.ip_rules.label), status = p_status, updated_at = now();
  insert into public.security_log (kind, login_id, ip, detail, seen)
  values (case when p_status = 'blocked' then 'IP_BLOCKED_SET' when old = 'blocked' then 'IP_UNBLOCKED' else 'IP_SAVED' end,
          me, v_ip, coalesce(nullif(trim(p_label), ''), 'address') || ' — ' ||
          case when p_status = 'blocked' then 'blocked' when old = 'blocked' then 'unblocked' else 'saved as allowed' end || ' by ' || me, true);
end $$;

-- Forget an address (it becomes "new" again).
create or replace function public.admin_ip_remove(p_ip text)
returns void language plpgsql security definer set search_path = '' as $$
declare me text;
begin
  if not public.is_security_admin() then raise exception 'Only the Admin or Sub Admin can do this.'; end if;
  select login_id into me from public.profiles where user_id = auth.uid();
  delete from public.ip_rules where ip = trim(p_ip);
  insert into public.security_log (kind, login_id, ip, detail, seen) values ('IP_REMOVED', me, trim(p_ip), 'removed from saved addresses by ' || me, true);
end $$;

-- Switch Inter mode on or off. It cannot go on while no address is saved.
create or replace function public.admin_set_inter_mode(p_on boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare me text;
begin
  if not public.is_security_admin() then raise exception 'Only the Admin or Sub Admin can do this.'; end if;
  if p_on and not exists (select 1 from public.ip_rules where status = 'allowed') then
    raise exception 'Save at least one address (your office) before switching Inter mode on.';
  end if;
  select login_id into me from public.profiles where user_id = auth.uid();
  update public.security_settings set inter_mode = p_on, changed_by = me, changed_at = now() where id = 1;
  insert into public.security_log (kind, login_id, detail) values ('INTER_MODE', me, 'Inter mode switched ' || case when p_on then 'ON' else 'OFF' end || ' by ' || me);
end $$;

-- Used only by the login server: how many OTHER devices is this person logged in on?
-- Logins not used for 7 days are ended first, so a forgotten old browser does not block a new login.
create or replace function public.svc_device_count(p_user_id uuid, p_except uuid)
returns int language plpgsql security definer set search_path = '' as $$
declare n int;
begin
  delete from auth.sessions s
   where s.user_id = p_user_id and s.id <> p_except
     and greatest(s.updated_at, s.refreshed_at::timestamptz, s.created_at,
                  (select max(ls.last_seen) from public.login_sessions ls where ls.auth_session_id = s.id)) < now() - interval '7 days';
  select count(*) into n from auth.sessions where user_id = p_user_id and id <> p_except;
  return n;
end $$;

revoke all on function public.admin_ip_list(), public.admin_ip_set(text, text, text), public.admin_ip_remove(text),
  public.admin_set_inter_mode(boolean), public.svc_device_count(uuid, uuid) from public, anon, authenticated;
grant execute on function public.admin_ip_list(), public.admin_ip_set(text, text, text), public.admin_ip_remove(text),
  public.admin_set_inter_mode(boolean) to authenticated;
grant execute on function public.svc_device_count(uuid, uuid) to service_role;
