-- Sentire Command Center — update 10: WhatsApp YES / NO confirmation links (22 Nov 2026)
-- Job Work "Confirm stock" sends the job worker a WhatsApp with two links: YES and NO.
-- Tapping a link opens confirm.html (no login), which records the answer here.
-- The Job Work page then shows "Confirmed by party" on its own — nobody has to type anything.
--
-- Safety: each request has a long random token (cannot be guessed). Anyone without a login can
-- only (a) read the one request whose token they hold and (b) answer it once. Nothing else.

create table if not exists public.wa_confirms (
  token       text primary key default encode(extensions.gen_random_bytes(18), 'hex'),
  kind        text not null default 'jw_stock',
  party       text not null,
  lines       jsonb not null default '[]'::jsonb,      -- [{item, qty, unit}] as sent
  created_by  uuid default auth.uid(),
  created_at  timestamptz not null default now(),
  answer      text check (answer in ('yes','no')),
  note        text,
  answered_at timestamptz
);
create index if not exists wa_confirms_party_idx on public.wa_confirms (kind, party, created_at desc);
alter table public.wa_confirms enable row level security;
revoke all on public.wa_confirms from anon, public, authenticated;

-- Logged-in users: make a request, read the latest request per party
create or replace function public.wa_confirm_create(p_party text, p_lines jsonb, p_kind text default 'jw_stock')
returns text language plpgsql security definer set search_path = '' as $$
declare t text;
begin
  if not public.is_member() then raise exception 'not allowed'; end if;
  insert into public.wa_confirms(kind, party, lines) values (coalesce(p_kind,'jw_stock'), p_party, coalesce(p_lines,'[]'::jsonb))
  returning token into t;
  return t;
end $$;

create or replace function public.wa_confirm_latest(p_kind text default 'jw_stock')
returns table(party text, lines jsonb, created_at timestamptz, answer text, note text, answered_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select distinct on (c.party) c.party, c.lines, c.created_at, c.answer, c.note, c.answered_at
  from public.wa_confirms c
  where public.is_member() and c.kind = coalesce(p_kind,'jw_stock')
  order by c.party, c.created_at desc;
$$;

-- Job worker (no login): read one request by its token, answer it once
create or replace function public.wa_confirm_get(p_token text)
returns json language sql stable security definer set search_path = '' as $$
  select json_build_object('party', party, 'lines', lines, 'created_at', created_at, 'answer', answer, 'note', note, 'answered_at', answered_at)
  from public.wa_confirms where token = p_token and length(p_token) >= 30;
$$;

create or replace function public.wa_confirm_answer(p_token text, p_answer text, p_note text default null)
returns json language plpgsql security definer set search_path = '' as $$
declare r public.wa_confirms;
begin
  if p_answer not in ('yes','no') or length(coalesce(p_token,'')) < 30 then return json_build_object('ok', false, 'error', 'bad'); end if;
  select * into r from public.wa_confirms where token = p_token for update;
  if not found then return json_build_object('ok', false, 'error', 'missing'); end if;
  if r.answer is null then
    update public.wa_confirms set answer = p_answer, note = left(nullif(trim(p_note),''), 500), answered_at = now() where token = p_token;
    return json_build_object('ok', true, 'answer', p_answer);
  end if;
  -- already answered: a NO may still add / change its note (what is different)
  if r.answer = 'no' and p_answer = 'no' and nullif(trim(p_note),'') is not null then
    update public.wa_confirms set note = left(trim(p_note), 500) where token = p_token;
  end if;
  return json_build_object('ok', true, 'answer', r.answer, 'already', true);
end $$;

revoke all on function public.wa_confirm_create(text, jsonb, text) from public, anon;
revoke all on function public.wa_confirm_latest(text)              from public, anon;
grant execute on function public.wa_confirm_create(text, jsonb, text) to authenticated;
grant execute on function public.wa_confirm_latest(text)              to authenticated;
grant execute on function public.wa_confirm_get(text)                  to anon, authenticated;
grant execute on function public.wa_confirm_answer(text, text, text)   to anon, authenticated;
