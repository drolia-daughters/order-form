-- ═══════════════════════════════════════════════════════════════
--  Update 7 — Who is logged in, from where, and remote Log out (19 Nov 2026)
--  Run once in the Supabase SQL Editor, after updates 1–6.
--
--  • Every login (Admin AND users) is now written to security_log with the
--    internet address (IP), city, region and country.
--  • login_sessions keeps one row per login: device, place, last activity.
--  • Admin and Sub Admin can see who is logged in and log anyone out.
--    "Sub Admin" = a user with BOTH the delete and the approve right.
--  • A logged-out person loses access at once: every data check now also
--    checks that their login session still exists.
-- ═══════════════════════════════════════════════════════════════

alter table public.security_log
  add column if not exists city text,
  add column if not exists region text,
  add column if not exists country text;

create table if not exists public.login_sessions (
  id              uuid primary key default gen_random_uuid(),
  auth_session_id uuid,                      -- the Supabase login session (auth.sessions.id)
  user_id         uuid not null,
  login_id        text,
  name            text,
  role            text,
  ip              text,
  city            text,
  region          text,
  country         text,
  device          text,                      -- browser / computer description
  started_at      timestamptz not null default now(),
  last_seen       timestamptz not null default now(),
  ended_at        timestamptz,
  ended_by        text                       -- login ID of the Admin / Sub Admin who logged it out
);
create index if not exists login_sessions_auth_idx on public.login_sessions (auth_session_id);
create index if not exists login_sessions_user_idx on public.login_sessions (user_id, started_at desc);
alter table public.login_sessions enable row level security;
revoke all on public.login_sessions from anon, authenticated;

-- Is the login session in this person's token still alive? (Removed when someone is logged out.)
-- A token without a session ID is treated as alive, so nothing breaks if Supabase ever leaves it out.
create or replace function public.session_alive()
returns boolean language sql stable security definer set search_path = '' as $$
  select case when nullif(auth.jwt() ->> 'session_id', '') is null then true
              else exists (select 1 from auth.sessions where id = (auth.jwt() ->> 'session_id')::uuid) end;
$$;

create or replace function public.is_member()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles where user_id = (select auth.uid())) and public.session_alive();
$$;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles where user_id = (select auth.uid()) and role = 'Admin') and public.session_alive();
$$;

-- Admin, or Sub Admin (a user with both the delete and the approve right).
create or replace function public.is_security_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles where user_id = (select auth.uid())
                 and (role = 'Admin' or (can_delete and can_approve))) and public.session_alive();
$$;

create or replace function public.my_profile()
returns json language sql stable security definer set search_path = '' as $$
  select json_build_object('login_id', login_id, 'name', name, 'role', role, 'apps', apps,
                           'can_delete', (role = 'Admin' or can_delete), 'can_approve', (role = 'Admin' or can_approve),
                           'can_bill', (role = 'Admin' or can_bill))
    from public.profiles where user_id = (select auth.uid()) and public.session_alive();
$$;

-- Admin and Sub Admin may read the security log and the login list.
drop policy if exists sec_read on public.security_log;
create policy sec_read on public.security_log for select to authenticated using ((select public.is_security_admin()));
grant select on public.login_sessions to authenticated;
drop policy if exists ls_read on public.login_sessions;
create policy ls_read on public.login_sessions for select to authenticated using ((select public.is_security_admin()));

create or replace function public.admin_security_seen()
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_security_admin() then raise exception 'Only the Admin or Sub Admin can do this.'; end if;
  update public.security_log set seen = true where not seen;
end $$;

-- Every open page calls this once a minute. 'ok' = carry on, 'ended' = you were logged out.
create or replace function public.session_ping()
returns text language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or not public.is_member() then return 'ended'; end if;
  if nullif(auth.jwt() ->> 'session_id', '') is not null then
    update public.login_sessions set last_seen = now()
     where auth_session_id = (auth.jwt() ->> 'session_id')::uuid and ended_at is null;
  end if;
  return 'ok';
end $$;

-- Everyone logged in right now (one row per login session), with place and device when known.
-- Logins made before this update have no login_sessions row; their place is taken from the
-- security log entry written at the moment of that login.
create or replace function public.admin_logged_in()
returns table (session_id uuid, login_id text, name text, role text, started_at timestamptz, last_active timestamptz,
               ip text, city text, region text, country text, device text, is_me boolean)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_security_admin() then raise exception 'Only the Admin or Sub Admin can do this.'; end if;
  return query
  select s.id, p.login_id, p.name, p.role, s.created_at,
         greatest(s.updated_at, s.refreshed_at::timestamptz, ls.last_seen),
         coalesce(ls.ip, lg.ip), coalesce(ls.city, lg.city), coalesce(ls.region, lg.region), coalesce(ls.country, lg.country),
         ls.device,
         s.id::text = coalesce(auth.jwt() ->> 'session_id', '')
    from auth.sessions s
    join public.profiles p on p.user_id = s.user_id
    left join public.login_sessions ls on ls.auth_session_id = s.id
    left join lateral (select l.ip, l.city, l.region, l.country from public.security_log l
                        where l.login_id = p.login_id and l.kind in ('login_ok', 'admin_login_ok')
                          and l.at between s.created_at - interval '1 minute' and s.created_at + interval '1 minute'
                        order by abs(extract(epoch from l.at - s.created_at)) limit 1) lg on true
   order by greatest(s.updated_at, s.refreshed_at::timestamptz, ls.last_seen) desc;
end $$;

-- Log out one login session (that device only). The person loses access at once.
create or replace function public.admin_end_session(p_session_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare me text; who text; w_ip text; w_place text;
begin
  if not public.is_security_admin() then raise exception 'Only the Admin or Sub Admin can do this.'; end if;
  select login_id into me from public.profiles where user_id = auth.uid();
  select r.login_id, r.ip, concat_ws(', ', r.city, r.country) into who, w_ip, w_place
    from public.admin_logged_in() r where r.session_id = p_session_id;
  if who is null then raise exception 'That login has already ended.'; end if;
  delete from auth.sessions where id = p_session_id;
  update public.login_sessions set ended_at = now(), ended_by = me where auth_session_id = p_session_id and ended_at is null;
  insert into public.security_log (kind, login_id, ip, detail)
  values ('FORCED_LOGOUT', who, w_ip, 'logged out' || coalesce(' (' || nullif(w_place, '') || ')', '') || ' by ' || me);
end $$;

-- Log a person out on EVERY device.
create or replace function public.admin_end_all_sessions(p_login_id text)
returns int language plpgsql security definer set search_path = '' as $$
declare me text; uid uuid; n int;
begin
  if not public.is_security_admin() then raise exception 'Only the Admin or Sub Admin can do this.'; end if;
  select login_id into me from public.profiles where user_id = auth.uid();
  select user_id into uid from public.profiles where login_id = lower(trim(p_login_id));
  if uid is null then raise exception 'No such login ID.'; end if;
  delete from auth.sessions where user_id = uid;
  get diagnostics n = row_count;
  update public.login_sessions set ended_at = now(), ended_by = me where user_id = uid and ended_at is null;
  insert into public.security_log (kind, login_id, detail)
  values ('FORCED_LOGOUT', lower(trim(p_login_id)), 'logged out on all devices (' || n || ') by ' || me);
  return n;
end $$;

revoke all on function public.session_alive(), public.is_security_admin(), public.session_ping(), public.admin_logged_in(),
  public.admin_end_session(uuid), public.admin_end_all_sessions(text) from public, anon;
grant execute on function public.session_alive(), public.is_security_admin(), public.session_ping(), public.admin_logged_in(),
  public.admin_end_session(uuid), public.admin_end_all_sessions(text) to authenticated;
