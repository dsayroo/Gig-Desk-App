-- Gig Desk · guest song requests
-- Run once in Supabase: SQL Editor → New query → paste → Run.
-- Safe to run again: it only creates what is missing and replaces the functions.

create extension if not exists pgcrypto;

-- One row per event that takes requests. Only its owner (the signed-in DJ) can see it.
create table if not exists public.rq_events (
  id          text primary key default translate(encode(gen_random_bytes(9), 'base64'), '+/', 'xy'),
  owner       uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name        text not null check (char_length(name) between 1 and 120),
  event_date  date,
  is_open     boolean not null default true,
  welcome     text not null default '' check (char_length(welcome) <= 300),
  dnp         text not null default '' check (char_length(dnp) <= 20000),
  clean_only  boolean not null default false,
  created_at  timestamptz not null default now()
);

-- Guest requests. Guests never read this table; they can only add to it through rq_submit().
create table if not exists public.rq_requests (
  id          uuid primary key default gen_random_uuid(),
  event_id    text not null references public.rq_events(id) on delete cascade,
  song        text not null check (char_length(song) between 1 and 120),
  artist      text not null default '' check (char_length(artist) <= 120),
  guest_name  text not null default '' check (char_length(guest_name) <= 60),
  note        text not null default '' check (char_length(note) <= 200),
  song_key    text not null,
  votes       int  not null default 1,
  status      text not null default 'new' check (status in ('new', 'queued', 'played', 'skipped')),
  device      text not null default '' check (char_length(device) <= 64),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists rq_requests_event_idx on public.rq_requests (event_id, created_at desc);

alter table public.rq_events   enable row level security;
alter table public.rq_requests enable row level security;

drop policy if exists "owner manages events"   on public.rq_events;
drop policy if exists "owner reads requests"   on public.rq_requests;
drop policy if exists "owner updates requests" on public.rq_requests;
drop policy if exists "owner deletes requests" on public.rq_requests;

create policy "owner manages events" on public.rq_events
  for all to authenticated using (owner = auth.uid()) with check (owner = auth.uid());
create policy "owner reads requests" on public.rq_requests
  for select to authenticated using (exists (select 1 from public.rq_events e where e.id = event_id and e.owner = auth.uid()));
create policy "owner updates requests" on public.rq_requests
  for update to authenticated using (exists (select 1 from public.rq_events e where e.id = event_id and e.owner = auth.uid()))
  with check (exists (select 1 from public.rq_events e where e.id = event_id and e.owner = auth.uid()));
create policy "owner deletes requests" on public.rq_requests
  for delete to authenticated using (exists (select 1 from public.rq_events e where e.id = event_id and e.owner = auth.uid()));

-- What a guest may see about an event: its name, date, whether requests are open, and the welcome line.
create or replace function public.rq_event_info(p_code text)
returns table (name text, event_date date, is_open boolean, welcome text)
language sql stable security definer set search_path = public as $$
  select e.name, e.event_date, e.is_open, e.welcome from public.rq_events e where e.id = p_code;
$$;

-- A guest sends a request. Returns: ok | added_vote | closed | not_found | invalid | slow_down | busy
create or replace function public.rq_submit(p_code text, p_song text, p_artist text, p_name text, p_note text, p_device text)
returns text language plpgsql security definer set search_path = public as $$
declare v_open boolean; v_key text; v_id uuid;
begin
  select e.is_open into v_open from public.rq_events e where e.id = p_code;
  if v_open is null then return 'not_found'; end if;
  if not v_open then return 'closed'; end if;
  p_song := btrim(coalesce(p_song, '')); p_artist := btrim(coalesce(p_artist, ''));
  p_name := btrim(coalesce(p_name, '')); p_note := btrim(coalesce(p_note, '')); p_device := left(coalesce(p_device, ''), 64);
  if char_length(p_song) < 1 or char_length(p_song) > 120 or char_length(p_artist) > 120
     or char_length(p_name) > 60 or char_length(p_note) > 200 then return 'invalid'; end if;
  if p_device <> '' and (select count(*) from public.rq_requests r
      where r.event_id = p_code and r.device = p_device and r.created_at > now() - interval '10 minutes') >= 5 then return 'slow_down'; end if;
  if (select count(*) from public.rq_requests r where r.event_id = p_code and r.created_at > now() - interval '1 hour') >= 400 then return 'busy'; end if;
  v_key := regexp_replace(lower(p_song), '[^a-z0-9]+', '', 'g') || '|' || regexp_replace(lower(p_artist), '[^a-z0-9]+', '', 'g');
  -- Same song already waiting? Count it as another vote instead of a duplicate.
  with target as (
    select r.id from public.rq_requests r
    where r.event_id = p_code and r.status in ('new', 'queued')
      and (r.song_key = v_key or (split_part(r.song_key, '|', 1) = split_part(v_key, '|', 1) and (p_artist = '' or split_part(r.song_key, '|', 2) = '')))
    order by r.created_at limit 1
  ), bumped as (
    update public.rq_requests r set votes = r.votes + 1, updated_at = now(),
      artist = case when r.artist = '' then p_artist else r.artist end,
      note = case when p_note <> '' and char_length(r.note) + char_length(p_note) <= 195 then btrim(r.note || ' / ' || p_note, ' /') else r.note end
    from target where r.id = target.id returning r.id
  ) select id into v_id from bumped;
  if v_id is not null then return 'added_vote'; end if;
  insert into public.rq_requests (event_id, song, artist, guest_name, note, song_key, device)
  values (p_code, p_song, p_artist, p_name, p_note, v_key, p_device);
  return 'ok';
end; $$;

-- Tiny call the keep-alive job uses so a free project doesn't pause between gigs.
create or replace function public.rq_ping() returns int language sql stable as $$ select 1; $$;

revoke all on function public.rq_submit(text, text, text, text, text, text) from public;
revoke all on function public.rq_event_info(text) from public;
grant execute on function public.rq_submit(text, text, text, text, text, text) to anon, authenticated;
grant execute on function public.rq_event_info(text) to anon, authenticated;
grant execute on function public.rq_ping() to anon, authenticated;

-- Live updates for the DJ board (still limited by the rules above).
do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'rq_requests') then
    alter publication supabase_realtime add table public.rq_requests;
  end if;
end $$;
