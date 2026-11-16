-- ═══════════════════════════════════════════════════════════════
--  SENTIRE COMMAND CENTER — Supabase setup, part 1: LOGIN
--  Run once: Supabase dashboard → SQL Editor → New query → paste ALL of this → Run.
--  Safe to run again (it replaces the functions, keeps the logins).
--
--  What it makes:
--    • table  public.profiles   — who may use the site: login ID, name, role (Admin / User)
--    • functions the pages call — log in, create the Admin (first time only),
--      and Admin-only: list / add / edit / remove users
--  Passwords are kept by Supabase Auth in scrambled (bcrypt) form, never as plain text.
-- ═══════════════════════════════════════════════════════════════

create table if not exists public.profiles (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  login_id   text not null unique check (login_id ~ '^[a-z0-9._-]{3,20}$'),
  name       text not null,
  role       text not null check (role in ('Admin', 'User')),
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
revoke all on public.profiles from anon, authenticated;
grant select on public.profiles to authenticated;

drop policy if exists "read own profile" on public.profiles;
create policy "read own profile" on public.profiles
  for select to authenticated using (user_id = (select auth.uid()));

-- ─── Helpers (also used later by the data tables' access rules) ───
create or replace function public.is_member() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles where user_id = (select auth.uid()));
$$;

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles where user_id = (select auth.uid()) and role = 'Admin');
$$;

-- ─── Internal: check the details of a login ───
create or replace function public._check_login(p_login_id text, p_name text, p_password text, p_ignore uuid)
returns text language plpgsql security definer set search_path = '' as $$
declare v_id text := lower(trim(coalesce(p_login_id, '')));
begin
  if v_id !~ '^[a-z0-9._-]{3,20}$' then
    raise exception 'Login ID must be 3–20 letters or numbers (no spaces).';
  end if;
  if trim(coalesce(p_name, '')) = '' then raise exception 'Enter the person''s name.'; end if;
  if p_password is not null and length(p_password) < 6 then
    raise exception 'Password must be at least 6 characters.';
  end if;
  if exists (select 1 from public.profiles where login_id = v_id and (p_ignore is null or user_id <> p_ignore)) then
    raise exception 'The login ID "%" is already used.', v_id;
  end if;
  return v_id;
end $$;

-- ─── Internal: create one login (Supabase Auth user + profile) ───
create or replace function public._create_login(p_login_id text, p_name text, p_password text, p_role text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_id    text := public._check_login(p_login_id, p_name, coalesce(p_password, ''), null);
  v_uid   uuid := gen_random_uuid();
  v_email text := 'u-' || replace(v_uid::text, '-', '') || '@login.sentire.invalid';  -- internal only, never mailed
begin
  insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
                          raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
                          confirmation_token, recovery_token, email_change_token_new, email_change)
  values ('00000000-0000-0000-0000-000000000000', v_uid, 'authenticated', 'authenticated', v_email,
          extensions.crypt(p_password, extensions.gen_salt('bf', 10)), now(),
          '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now(), '', '', '', '');

  insert into auth.identities (provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
  values (v_uid::text, v_uid,
          jsonb_build_object('sub', v_uid::text, 'email', v_email, 'email_verified', true, 'phone_verified', false),
          'email', now(), now(), now());

  insert into public.profiles (user_id, login_id, name, role) values (v_uid, v_id, left(trim(p_name), 40), p_role);
  return v_uid;
end $$;

-- ─── Called by the login page (before anyone is logged in) ───
-- Has the Admin been created yet?
create or replace function public.login_status() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles);
$$;

-- Internal e-mail that belongs to a login ID. An unknown ID gets a made-up address,
-- so the page cannot be used to find out which login IDs exist.
create or replace function public.login_email(p_login_id text) returns text
language sql stable security definer set search_path = '' as $$
  select coalesce(
    (select u.email::text from public.profiles p join auth.users u on u.id = p.user_id
      where p.login_id = lower(trim(coalesce(p_login_id, '')))),
    'none-' || md5(lower(trim(coalesce(p_login_id, '')))) || '@login.sentire.invalid');
$$;

-- First run only: create the Admin. Refuses once any login exists.
create or replace function public.setup_admin(p_login_id text, p_name text, p_password text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  lock table public.profiles in exclusive mode;
  if exists (select 1 from public.profiles) then
    raise exception 'Setup is already done. Please log in.';
  end if;
  perform public._create_login(p_login_id, p_name, p_password, 'Admin');
end $$;

-- ─── Called after login ───
create or replace function public.my_profile() returns json
language sql stable security definer set search_path = '' as $$
  select json_build_object('login_id', login_id, 'name', name, 'role', role)
    from public.profiles where user_id = (select auth.uid());
$$;

-- ─── Admin only ───
create or replace function public.admin_list_users()
returns table (user_id uuid, login_id text, name text, role text)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'Only the Admin can do this.'; end if;
  return query select p.user_id, p.login_id, p.name, p.role from public.profiles p
               order by (p.role = 'Admin') desc, p.created_at;
end $$;

create or replace function public.admin_add_user(p_login_id text, p_name text, p_password text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'Only the Admin can do this.'; end if;
  lock table public.profiles in exclusive mode;
  if (select count(*) from public.profiles where role = 'User') >= 4 then
    raise exception 'You already have 4 users. Remove one first.';
  end if;
  perform public._create_login(p_login_id, p_name, p_password, 'User');
end $$;

-- Change anyone's login ID / name, and the password when p_password is given.
create or replace function public.admin_update_user(p_user_id uuid, p_login_id text, p_name text, p_password text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare v_id text; v_pw text := nullif(p_password, '');
begin
  if not public.is_admin() then raise exception 'Only the Admin can do this.'; end if;
  if not exists (select 1 from public.profiles where user_id = p_user_id) then
    raise exception 'That login no longer exists.';
  end if;
  v_id := public._check_login(p_login_id, p_name, v_pw, p_user_id);
  update public.profiles set login_id = v_id, name = left(trim(p_name), 40) where user_id = p_user_id;
  if v_pw is not null then
    update auth.users set encrypted_password = extensions.crypt(v_pw, extensions.gen_salt('bf', 10)), updated_at = now()
     where id = p_user_id;
    if p_user_id <> (select auth.uid()) then
      delete from auth.sessions where user_id = p_user_id;   -- log that person out everywhere
    end if;
  end if;
end $$;

create or replace function public.admin_remove_user(p_user_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'Only the Admin can do this.'; end if;
  if not exists (select 1 from public.profiles where user_id = p_user_id) then
    raise exception 'That login no longer exists.';
  end if;
  if exists (select 1 from public.profiles where user_id = p_user_id and role = 'Admin') then
    raise exception 'The Admin login cannot be removed.';
  end if;
  delete from auth.users where id = p_user_id;   -- the profile goes with it
end $$;

-- ─── Who may call what ───
revoke all on function public.is_member()                                   from public, anon;
revoke all on function public.is_admin()                                    from public, anon;
revoke all on function public._check_login(text, text, text, uuid)          from public, anon, authenticated;
revoke all on function public._create_login(text, text, text, text)         from public, anon, authenticated;
revoke all on function public.my_profile()                                  from public, anon;
revoke all on function public.admin_list_users()                            from public, anon;
revoke all on function public.admin_add_user(text, text, text)              from public, anon;
revoke all on function public.admin_update_user(uuid, text, text, text)     from public, anon;
revoke all on function public.admin_remove_user(uuid)                       from public, anon;

grant execute on function public.login_status()                             to anon, authenticated;
grant execute on function public.login_email(text)                          to anon, authenticated;
grant execute on function public.setup_admin(text, text, text)              to anon, authenticated;
grant execute on function public.is_member()                                to authenticated;
grant execute on function public.is_admin()                                 to authenticated;
grant execute on function public.my_profile()                               to authenticated;
grant execute on function public.admin_list_users()                         to authenticated;
grant execute on function public.admin_add_user(text, text, text)           to authenticated;
grant execute on function public.admin_update_user(uuid, text, text, text)  to authenticated;
grant execute on function public.admin_remove_user(uuid)                    to authenticated;

-- ─── Emergency: lost Admin password ───
-- Run this ONE line in the SQL Editor. It erases every login (not your business data);
-- then open the site and create the Admin again.
--   delete from auth.users where id in (select user_id from public.profiles);
