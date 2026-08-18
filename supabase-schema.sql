-- ============================================================
-- Con-Raumplan: vollständiges, mandantenfähiges Schema
-- Supabase-Dashboard → SQL Editor → vollständig einfügen → Run.
-- Für neue und bestehende aktuelle Installationen geeignet:
-- Das Skript löscht keine Anwendungsdaten und kann erneut ausgeführt werden.
-- ============================================================

-- ---------- Bestehende Tabellen (falls schon vorhanden) ----------
create table if not exists rooms (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  floor text,
  features jsonb not null default '{}',
  notes text,
  sort int not null default 0,
  color text,
  marker text
);

create table if not exists tables (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null,
  name text not null,
  seats int not null default 6,
  notes text,
  sort int not null default 0
);

create table if not exists assignments (
  id uuid primary key default gen_random_uuid(),
  slot_key text not null,
  session_key text not null,
  table_id uuid,
  manual_game jsonb,
  note text,
  updated_at timestamptz not null default now()
);

create table if not exists requests (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  game_ref text,
  message text not null,
  contact text,
  status text not null default 'offen',
  orga_notiz text
);

-- ---------- Cons + Crew-Mitgliedschaft (mit Rollen) ----------
create table if not exists cons (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  playabl_event_id text,
  playabl_community_id text,
  slug text unique,
  listed boolean not null default true,
  created_by uuid not null references auth.users(id) default auth.uid(),
  created_at timestamptz not null default now()
);

-- Optionaler, von der Crew gepflegter externer Lageplan (vorzugsweise PDF).
alter table public.cons add column if not exists floor_plan_url text;
alter table public.cons add column if not exists floor_plan_mode text not null default 'none';
update public.cons set floor_plan_mode = 'external'
where floor_plan_url is not null and btrim(floor_plan_url) <> '' and floor_plan_mode = 'none';
alter table public.cons drop constraint if exists cons_floor_plan_mode_check;
alter table public.cons add constraint cons_floor_plan_mode_check
  check (floor_plan_mode in ('none', 'external', 'editor', 'both'));

create table if not exists con_members (
  con_id uuid not null references cons(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'editor' check (role in ('admin','editor')),
  status text not null default 'pending' check (status in ('pending','accepted')),
  added_at timestamptz not null default now(),
  primary key (con_id, user_id)
);

-- Fachliches Lageplan-Dokument. Der Entwurf bleibt Crew-intern; öffentlich
-- wird ausschließlich der ausdrücklich veröffentlichte Snapshot ausgeliefert.
create table if not exists con_floor_plans (
  con_id uuid primary key references cons(id) on delete cascade,
  schema_version int not null default 1 check (schema_version > 0),
  document jsonb not null default '{"schemaVersion":1,"orientation":"landscape","floors":[]}'::jsonb,
  published_document jsonb,
  revision bigint not null default 1 check (revision > 0),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id),
  published_at timestamptz,
  published_by uuid references auth.users(id),
  check (jsonb_typeof(document) = 'object'),
  check (published_document is null or jsonb_typeof(published_document) = 'object')
);

-- Kleine, bewusst begrenzte Sicherungshistorie. Pro Con bleiben höchstens
-- drei automatische, drei veröffentlichte und eine Sicherheitsversion.
create table if not exists con_floor_plan_versions (
  id uuid primary key default gen_random_uuid(),
  con_id uuid not null references cons(id) on delete cascade,
  source_revision bigint not null check (source_revision > 0),
  document jsonb not null,
  kind text not null check (kind in ('automatic', 'published', 'safety')),
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  check (jsonb_typeof(document) = 'object')
);
create index if not exists con_floor_plan_versions_con_kind_created_idx
  on con_floor_plan_versions (con_id, kind, created_at desc);

-- ---------- Slots (Tagesabschnitts-Vorlagen + konkrete, pro-Con-Slots) ----------
create table if not exists slot_buckets (
  id uuid primary key default gen_random_uuid(),
  con_id uuid not null references cons(id) on delete cascade,
  label text not null,
  start_hour numeric(4,2) not null check (start_hour >= 0 and start_hour <= 24),
  end_hour   numeric(4,2) not null check (end_hour   >= 0 and end_hour   <= 24),
  sort int not null default 0,
  active boolean not null default true
);

create table if not exists slots (
  id uuid primary key default gen_random_uuid(),
  con_id uuid not null references cons(id) on delete cascade,
  key text not null,
  label text not null,
  day date,
  bucket_id uuid references slot_buckets(id) on delete set null,
  sort int not null default 0,
  created_at timestamptz not null default now()
);

-- ---------- Raum-Eigenschaften: kontrollierte, globale Chip-Vokabelliste ----------
create table if not exists feature_tags (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  label text not null,
  sort int not null default 0
);

create table if not exists room_feature_tags (
  con_id uuid not null,
  room_id uuid not null,
  feature_tag_id uuid not null references feature_tags(id) on delete cascade,
  primary key (con_id, room_id, feature_tag_id)
);

-- ---------- Spiel-Anforderungen: dieselbe Vokabelliste (feature_tags) wie
-- Raum-Eigenschaften, nur an games statt rooms gehängt — fürs Matching. ----------
create table if not exists game_required_tags (
  con_id uuid not null,
  game_id uuid not null,
  feature_tag_id uuid not null references feature_tags(id) on delete cascade,
  primary key (con_id, game_id, feature_tag_id)
);

-- ---------- Spiele (ersetzt den manual_game-jsonb-Blob in assignments) ----------
create table if not exists games (
  id uuid primary key default gen_random_uuid(),
  con_id uuid not null references cons(id) on delete cascade,
  title text not null,
  provider text,
  seats int not null default 4,
  workshop boolean not null default false,
  description text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------- Bestehende Installationen auf den aktuellen Stand bringen ----------
alter table cons add column if not exists listed boolean not null default true;

alter table con_members add column if not exists role text;
alter table con_members add column if not exists status text;
update con_members set role = coalesce(role, 'admin'), status = coalesce(status, 'accepted');
alter table con_members alter column role set default 'editor';
alter table con_members alter column status set default 'pending';
alter table con_members alter column role set not null;
alter table con_members alter column status set not null;
alter table con_members drop constraint if exists con_members_role_check;
alter table con_members add constraint con_members_role_check check (role in ('admin','editor'));
alter table con_members drop constraint if exists con_members_status_check;
alter table con_members add constraint con_members_status_check check (status in ('pending','accepted'));

alter table rooms add column if not exists color text;
alter table rooms drop constraint if exists rooms_color_hex_check;
alter table rooms add constraint rooms_color_hex_check
  check (color is null or color ~ '^#[0-9A-Fa-f]{6}$');
comment on column rooms.color is
  'Optional six-digit room base colour, e.g. #4F86F7.';

alter table rooms drop constraint if exists rooms_color_mode_check;
alter table rooms drop column if exists color_mode;

alter table rooms add column if not exists marker text;
alter table rooms drop constraint if exists rooms_marker_check;
alter table rooms add constraint rooms_marker_check
  check (marker is null or marker in ('circle', 'triangle', 'square', 'diamond', 'plus', 'cross', 'hexagon', 'star', 'sparkle', 'sun', 'moon', 'cloud', 'flower', 'tree', 'heart', 'flag', 'key', 'book', 'music', 'bulb', 'letter', 'dice', 'invader', 'wc', 'kitchen', 'door', 'coat', 'toy'));
comment on column rooms.marker is
  'Optional fixed symbol for the contrast colour-vision aid; NULL uses the automatic room-order symbol.';

-- ---------- con_id-Spalten hinzufügen ----------
alter table rooms       add column if not exists con_id uuid references cons(id) on delete cascade;
alter table tables      add column if not exists con_id uuid references cons(id) on delete cascade;
alter table assignments add column if not exists con_id uuid references cons(id) on delete cascade;
alter table requests    add column if not exists con_id uuid references cons(id) on delete cascade;

alter table rooms       alter column con_id set not null;
alter table tables      alter column con_id set not null;
alter table assignments alter column con_id set not null;
alter table requests    alter column con_id set not null;

-- ---------- Cross-Tenant-Härtung: Tisch/Zuordnung muss zur selben Con gehören ----------
-- Diese Unique-Constraints können bereits von Fremdschlüsseln verwendet
-- werden. Daher niemals löschen, sondern bei älteren Installationen nur
-- ergänzen, wenn sie noch fehlen.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.rooms'::regclass and conname = 'rooms_con_id_id_key'
  ) then
    alter table public.rooms add constraint rooms_con_id_id_key unique (con_id, id);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.tables'::regclass and conname = 'tables_con_id_id_key'
  ) then
    alter table public.tables add constraint tables_con_id_id_key unique (con_id, id);
  end if;
end
$$;

alter table tables drop constraint if exists tables_room_id_fkey;
alter table tables drop constraint if exists tables_room_same_con_fkey;
alter table tables add constraint tables_room_same_con_fkey
  foreign key (con_id, room_id) references rooms (con_id, id) on delete cascade;

alter table assignments drop constraint if exists assignments_table_id_fkey;
alter table assignments drop constraint if exists assignments_table_same_con_fkey;
alter table assignments add constraint assignments_table_same_con_fkey
  foreign key (con_id, table_id) references tables (con_id, id) on delete set null;

alter table assignments drop constraint if exists assignments_slot_key_session_key_key;
alter table assignments drop constraint if exists assignments_con_slot_session_key;
alter table assignments add constraint assignments_con_slot_session_key
  unique (con_id, slot_key, session_key);

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.slots'::regclass and conname = 'slots_con_id_key_key'
  ) then
    alter table public.slots add constraint slots_con_id_key_key unique (con_id, key);
  end if;
end
$$;
create index if not exists slots_con_sort_idx on slots (con_id, sort);
create index if not exists slot_buckets_con_idx on slot_buckets (con_id, sort);

-- Ein belegter Slot kann nicht mehr versehentlich verschwinden (restrict statt
-- cascade/set null — strenger als bei table_id, da "welcher Slot" wichtiger
-- ist als "welcher Tisch").
alter table assignments drop constraint if exists assignments_slot_same_con_fkey;
alter table assignments add constraint assignments_slot_same_con_fkey
  foreign key (con_id, slot_key) references slots (con_id, key) on delete restrict;

alter table room_feature_tags drop constraint if exists room_feature_tags_room_same_con_fkey;
alter table room_feature_tags add constraint room_feature_tags_room_same_con_fkey
  foreign key (con_id, room_id) references rooms (con_id, id) on delete cascade;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.games'::regclass and conname = 'games_con_id_id_key'
  ) then
    alter table public.games add constraint games_con_id_id_key unique (con_id, id);
  end if;
end
$$;

alter table game_required_tags drop constraint if exists game_required_tags_game_same_con_fkey;
alter table game_required_tags add constraint game_required_tags_game_same_con_fkey
  foreign key (con_id, game_id) references games (con_id, id) on delete cascade;

-- Ein Spiel hat höchstens eine Platzierungszeile (partieller Unique-Index) —
-- "verschieben" ist ein UPDATE dieser einen Zeile, nie ein zweiter Insert.
alter table assignments add column if not exists game_id uuid;
alter table assignments drop constraint if exists assignments_game_same_con_fkey;
alter table assignments add constraint assignments_game_same_con_fkey
  foreign key (con_id, game_id) references games (con_id, id) on delete cascade;
create unique index if not exists assignments_one_row_per_game_idx
  on assignments (con_id, game_id) where game_id is not null;

-- ---------- RLS aktivieren ----------
alter table rooms       enable row level security;
alter table tables      enable row level security;
alter table assignments enable row level security;
alter table requests    enable row level security;
alter table cons        enable row level security;
alter table con_members enable row level security;
alter table con_floor_plans enable row level security;
alter table con_floor_plan_versions enable row level security;
alter table slot_buckets enable row level security;
alter table slots        enable row level security;
alter table feature_tags enable row level security;
alter table room_feature_tags enable row level security;
alter table games enable row level security;
alter table game_required_tags enable row level security;
-- Bewusst KEIN "force row level security" auf con_members/cons — würde den
-- security-definer-Bypass in is_con_member()/is_con_admin() unterlaufen.

-- ---------- Super-Admin (site-weit, nicht pro Con) ----------
-- Bewusst KEINE Policies auf dieser Tabelle — nur über die SQL-Konsole
-- direkt befüllbar (Postgres-Owner-Rolle umgeht RLS), nie über den Client.
create table if not exists superadmins (
  user_id uuid primary key references auth.users(id) on delete cascade
);
alter table superadmins enable row level security;

create or replace function public.is_superadmin()
returns boolean language sql stable security definer set search_path = ''
as $$ select exists (select 1 from public.superadmins where user_id = auth.uid()); $$;
revoke all on function public.is_superadmin() from public;
grant execute on function public.is_superadmin() to authenticated;

-- ---------- Helper-Funktionen (alle security definer, search_path gepinnt) ----------
-- Super-Admin besteht is_con_member/is_con_admin für JEDE Con automatisch mit
-- ("Durchgriffsrecht auf alles"), ohne eigene con_members-Zeile.
create or replace function public.is_con_member(target_con uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.is_superadmin() or exists (
    select 1 from public.con_members
    where con_id = target_con and user_id = auth.uid() and status = 'accepted'
  );
$$;
revoke all on function public.is_con_member(uuid) from public;
grant execute on function public.is_con_member(uuid) to authenticated;

-- Akzeptierte Crew-Mitglieder dürfen den Lageplan ihrer eigenen Con ändern.
create or replace function public.set_con_floor_plan_url(target_con uuid, new_url text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  clean_url text := nullif(btrim(new_url), '');
begin
  if not public.is_con_member(target_con) then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if clean_url is not null
     and clean_url !~* '^(https://|/|[a-z0-9][a-z0-9._/-]*\.pdf(?:[?#].*)?$)' then
    raise exception 'invalid floor plan URL' using errcode = '22023';
  end if;
  update public.cons
  set floor_plan_url = clean_url,
      floor_plan_mode = case
        when clean_url is null and floor_plan_mode = 'both' then 'editor'
        when clean_url is null and floor_plan_mode = 'external' then 'none'
        when clean_url is not null and floor_plan_mode = 'editor' then 'both'
        when clean_url is not null and floor_plan_mode = 'none' then 'external'
        else floor_plan_mode
      end
  where id = target_con;
end;
$$;
revoke all on function public.set_con_floor_plan_url(uuid, text) from public;
grant execute on function public.set_con_floor_plan_url(uuid, text) to authenticated;

-- Quelle des öffentlichen Lageplans wählen. Ein Creator-Plan wird erst
-- sichtbar, sobald ein veröffentlichter Snapshot existiert.
create or replace function public.set_con_floor_plan_source(
  target_con uuid,
  new_mode text,
  new_url text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  clean_url text := nullif(btrim(new_url), '');
begin
  if not public.is_con_member(target_con) then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if new_mode not in ('none', 'external', 'editor', 'both') then
    raise exception 'invalid floor plan mode' using errcode = '22023';
  end if;
  if new_mode in ('external', 'both') and clean_url is null then
    raise exception 'external floor plan URL required' using errcode = '22023';
  end if;
  if clean_url is not null
     and clean_url !~* '^(https://|/|[a-z0-9][a-z0-9._/-]*\.pdf(?:[?#].*)?$)' then
    raise exception 'invalid floor plan URL' using errcode = '22023';
  end if;

  update public.cons
  set floor_plan_mode = new_mode,
      floor_plan_url = case when clean_url is not null then clean_url else floor_plan_url end
  where id = target_con;
end;
$$;
revoke all on function public.set_con_floor_plan_source(uuid, text, text) from public;
grant execute on function public.set_con_floor_plan_source(uuid, text, text) to authenticated;

-- Optimistisches Speichern: expected_revision=0 legt den ersten Entwurf an;
-- spätere Saves gelingen nur auf dem zuletzt geladenen Stand.
create or replace function public.save_con_floor_plan(
  target_con uuid,
  expected_revision bigint,
  new_document jsonb
)
returns bigint
language plpgsql
security definer
set search_path = ''
set lock_timeout = '2s'
set statement_timeout = '8s'
as $$
declare
  next_revision bigint;
begin
  if not public.is_con_member(target_con) then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if new_document is null or jsonb_typeof(new_document) <> 'object' then
    raise exception 'invalid floor plan document' using errcode = '22023';
  end if;
  if new_document->'schemaVersion' is distinct from '1'::jsonb
     or jsonb_typeof(new_document->'floors') <> 'array' then
    raise exception 'unsupported floor plan schema' using errcode = '22023';
  end if;
  if expected_revision < 0 then
    raise exception 'invalid floor plan revision' using errcode = '22023';
  end if;
  if pg_catalog.pg_column_size(new_document) > 2097152 then
    raise sqlstate 'PT413' using message = 'floor plan document is too large';
  end if;
  if not pg_catalog.pg_try_advisory_xact_lock(pg_catalog.hashtextextended(target_con::text, 0)) then
    raise sqlstate 'PT429' using message = 'floor plan save already in progress';
  end if;

  if expected_revision = 0 then
    insert into public.con_floor_plans
      (con_id, schema_version, document, revision, updated_at, updated_by)
    values (target_con, 1, new_document, 1, now(), auth.uid())
    on conflict (con_id) do nothing
    returning revision into next_revision;
  else
    -- Höchstens eine automatische Sicherung je 15 Minuten. Gesichert wird
    -- der vorherige Stand; bei einem Revisionskonflikt wird auch dieser
    -- Insert durch die Funktionstransaktion zurückgerollt.
    insert into public.con_floor_plan_versions
      (con_id, source_revision, document, kind, created_by)
    select fp.con_id, fp.revision, fp.document, 'automatic', auth.uid()
    from public.con_floor_plans fp
    where fp.con_id = target_con
      and fp.revision = expected_revision
      and not exists (
        select 1 from public.con_floor_plan_versions v
        where v.con_id = target_con and v.kind = 'automatic'
          and v.created_at > now() - interval '15 minutes'
      );

    update public.con_floor_plans
    set schema_version = 1,
        document = new_document,
        revision = public.con_floor_plans.revision + 1,
        updated_at = now(),
        updated_by = auth.uid()
    where public.con_floor_plans.con_id = target_con
      and public.con_floor_plans.revision = expected_revision
    returning revision into next_revision;
  end if;

  if next_revision is null then
    raise sqlstate 'PT409' using message = 'floor plan revision conflict';
  end if;

  delete from public.con_floor_plan_versions v
  where v.id in (
    select old.id from public.con_floor_plan_versions old
    where old.con_id = target_con and old.kind = 'automatic'
    order by old.created_at desc, old.id desc
    offset 3
  );
  return next_revision;
exception
  when lock_not_available then
    raise sqlstate 'PT503' using message = 'floor plan storage is busy';
  when query_canceled then
    raise sqlstate 'PT504' using message = 'floor plan save timed out';
end;
$$;
revoke all on function public.save_con_floor_plan(uuid, bigint, jsonb) from public;
grant execute on function public.save_con_floor_plan(uuid, bigint, jsonb) to authenticated;

create or replace function public.publish_con_floor_plan(
  target_con uuid,
  expected_revision bigint
)
returns void
language plpgsql
security definer
set search_path = ''
set lock_timeout = '2s'
set statement_timeout = '8s'
as $$
begin
  if not public.is_con_member(target_con) then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if not pg_catalog.pg_try_advisory_xact_lock(pg_catalog.hashtextextended(target_con::text, 0)) then
    raise sqlstate 'PT429' using message = 'floor plan save already in progress';
  end if;

  insert into public.con_floor_plan_versions
    (con_id, source_revision, document, kind, created_by)
  select fp.con_id, fp.revision, fp.document, 'published', auth.uid()
  from public.con_floor_plans fp
  where fp.con_id = target_con and fp.revision = expected_revision;

  update public.con_floor_plans
  set published_document = document,
      published_at = now(),
      published_by = auth.uid()
  where con_id = target_con and revision = expected_revision;
  if not found then
    raise sqlstate 'PT409' using message = 'floor plan revision conflict';
  end if;

  delete from public.con_floor_plan_versions v
  where v.id in (
    select old.id from public.con_floor_plan_versions old
    where old.con_id = target_con and old.kind = 'published'
    order by old.created_at desc, old.id desc
    offset 3
  );

  update public.cons
  set floor_plan_mode = case
    when floor_plan_mode in ('external', 'both') and nullif(btrim(floor_plan_url), '') is not null then 'both'
    else 'editor'
  end
  where id = target_con;
exception
  when lock_not_available then
    raise sqlstate 'PT503' using message = 'floor plan storage is busy';
  when query_canceled then
    raise sqlstate 'PT504' using message = 'floor plan publish timed out';
end;
$$;
revoke all on function public.publish_con_floor_plan(uuid, bigint) from public;
grant execute on function public.publish_con_floor_plan(uuid, bigint) to authenticated;

-- Import/Kopie ersetzt den Entwurf bewusst in einem Schritt und legt davor
-- immer eine einzelne Sicherheitsversion an. expected_revision=0 erlaubt die
-- Erstanlage bei einer Con ohne bisherigen Creator-Plan.
create or replace function public.replace_con_floor_plan(
  target_con uuid,
  expected_revision bigint,
  new_document jsonb
)
returns bigint
language plpgsql
security definer
set search_path = ''
set lock_timeout = '2s'
set statement_timeout = '8s'
as $$
declare
  current_revision bigint;
  current_document jsonb;
  next_revision bigint;
begin
  if not public.is_con_member(target_con) then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if new_document is null or jsonb_typeof(new_document) <> 'object'
     or new_document->'schemaVersion' is distinct from '1'::jsonb
     or jsonb_typeof(new_document->'floors') <> 'array' then
    raise exception 'unsupported floor plan schema' using errcode = '22023';
  end if;
  if expected_revision < 0 then
    raise exception 'invalid floor plan revision' using errcode = '22023';
  end if;
  if pg_catalog.pg_column_size(new_document) > 2097152 then
    raise sqlstate 'PT413' using message = 'floor plan document is too large';
  end if;
  if not pg_catalog.pg_try_advisory_xact_lock(pg_catalog.hashtextextended(target_con::text, 0)) then
    raise sqlstate 'PT429' using message = 'floor plan save already in progress';
  end if;

  select fp.revision, fp.document
  into current_revision, current_document
  from public.con_floor_plans fp
  where fp.con_id = target_con
  for update;

  if current_revision is null then
    if expected_revision <> 0 then
      raise sqlstate 'PT409' using message = 'floor plan revision conflict';
    end if;
    insert into public.con_floor_plans
      (con_id, schema_version, document, revision, updated_at, updated_by)
    values (target_con, 1, new_document, 1, now(), auth.uid())
    returning revision into next_revision;
  else
    if current_revision <> expected_revision then
      raise sqlstate 'PT409' using message = 'floor plan revision conflict';
    end if;
    insert into public.con_floor_plan_versions
      (con_id, source_revision, document, kind, created_by)
    values (target_con, current_revision, current_document, 'safety', auth.uid());
    delete from public.con_floor_plan_versions v
    where v.id in (
      select old.id from public.con_floor_plan_versions old
      where old.con_id = target_con and old.kind = 'safety'
      order by old.created_at desc, old.id desc
      offset 1
    );
    update public.con_floor_plans
    set schema_version = 1,
        document = new_document,
        revision = current_revision + 1,
        updated_at = now(),
        updated_by = auth.uid()
    where con_id = target_con
    returning revision into next_revision;
  end if;

  update public.cons
  set floor_plan_mode = case
    when floor_plan_mode in ('external', 'both') and nullif(btrim(floor_plan_url), '') is not null then 'both'
    else 'editor'
  end
  where id = target_con;
  return next_revision;
exception
  when lock_not_available then
    raise sqlstate 'PT503' using message = 'floor plan storage is busy';
  when query_canceled then
    raise sqlstate 'PT504' using message = 'floor plan replacement timed out';
end;
$$;
revoke all on function public.replace_con_floor_plan(uuid, bigint, jsonb) from public;
grant execute on function public.replace_con_floor_plan(uuid, bigint, jsonb) to authenticated;

create or replace function public.restore_con_floor_plan_version(
  target_con uuid,
  version_id uuid,
  expected_revision bigint
)
returns jsonb
language plpgsql
security definer
set search_path = ''
set lock_timeout = '2s'
set statement_timeout = '8s'
as $$
declare
  current_revision bigint;
  current_document jsonb;
  restored_document jsonb;
  next_revision bigint;
begin
  if not public.is_con_member(target_con) then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if not pg_catalog.pg_try_advisory_xact_lock(pg_catalog.hashtextextended(target_con::text, 0)) then
    raise sqlstate 'PT429' using message = 'floor plan save already in progress';
  end if;

  select fp.revision, fp.document
  into current_revision, current_document
  from public.con_floor_plans fp
  where fp.con_id = target_con
  for update;
  if current_revision is null or current_revision <> expected_revision then
    raise sqlstate 'PT409' using message = 'floor plan revision conflict';
  end if;

  select v.document into restored_document
  from public.con_floor_plan_versions v
  where v.id = version_id and v.con_id = target_con;
  if restored_document is null then
    raise exception 'floor plan version not found' using errcode = '22023';
  end if;

  insert into public.con_floor_plan_versions
    (con_id, source_revision, document, kind, created_by)
  values (target_con, current_revision, current_document, 'safety', auth.uid());
  delete from public.con_floor_plan_versions v
  where v.id in (
    select old.id from public.con_floor_plan_versions old
    where old.con_id = target_con and old.kind = 'safety'
    order by old.created_at desc, old.id desc
    offset 1
  );

  update public.con_floor_plans
  set document = restored_document,
      schema_version = 1,
      revision = current_revision + 1,
      updated_at = now(),
      updated_by = auth.uid()
  where con_id = target_con
  returning revision into next_revision;

  return jsonb_build_object('revision', next_revision, 'document', restored_document);
exception
  when lock_not_available then
    raise sqlstate 'PT503' using message = 'floor plan storage is busy';
  when query_canceled then
    raise sqlstate 'PT504' using message = 'floor plan restore timed out';
end;
$$;
revoke all on function public.restore_con_floor_plan_version(uuid, uuid, bigint) from public;
grant execute on function public.restore_con_floor_plan_version(uuid, uuid, bigint) to authenticated;

-- Räume, deren Tische und Eigenschafts-Tags werden in einer Transaktion
-- kopiert. Die Rückgabe enthält die neuen Zeilen und die exakte ID-Zuordnung,
-- mit der der Client optional auch den Lageplan umhängen kann.
create or replace function public.import_con_rooms(
  target_con uuid,
  source_con uuid,
  source_room_ids uuid[]
)
returns jsonb
language plpgsql
security definer
set search_path = ''
set statement_timeout = '8s'
as $$
declare
  source_room record;
  target_room_id uuid;
  target_room_ids uuid[] := array[]::uuid[];
  mapping jsonb := '[]'::jsonb;
begin
  if not public.is_con_member(target_con) or not public.is_con_member(source_con) then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if target_con = source_con or coalesce(array_length(source_room_ids, 1), 0) = 0 then
    raise exception 'invalid room import selection' using errcode = '22023';
  end if;

  for source_room in
    select r.* from public.rooms r
    where r.con_id = source_con and r.id = any(source_room_ids)
    order by r.sort, r.name
  loop
    target_room_id := gen_random_uuid();
    insert into public.rooms
      (id, con_id, name, floor, features, notes, sort, color, marker)
    values
      (target_room_id, target_con, source_room.name, source_room.floor,
       source_room.features, source_room.notes, source_room.sort,
       source_room.color, source_room.marker);

    insert into public.tables (id, con_id, room_id, name, seats, notes, sort)
    select gen_random_uuid(), target_con, target_room_id, t.name, t.seats, t.notes, t.sort
    from public.tables t
    where t.con_id = source_con and t.room_id = source_room.id;

    insert into public.room_feature_tags (con_id, room_id, feature_tag_id)
    select target_con, target_room_id, rt.feature_tag_id
    from public.room_feature_tags rt
    where rt.con_id = source_con and rt.room_id = source_room.id
    on conflict do nothing;

    target_room_ids := array_append(target_room_ids, target_room_id);
    mapping := mapping || jsonb_build_array(jsonb_build_object(
      'sourceRoomId', source_room.id,
      'targetRoomId', target_room_id
    ));
  end loop;

  if coalesce(array_length(target_room_ids, 1), 0) = 0 then
    raise exception 'no source rooms found' using errcode = '22023';
  end if;

  return jsonb_build_object(
    'roomMapping', mapping,
    'rooms', coalesce((
      select jsonb_agg(to_jsonb(r) order by r.sort, r.name)
      from public.rooms r where r.id = any(target_room_ids)
    ), '[]'::jsonb),
    'tables', coalesce((
      select jsonb_agg(to_jsonb(t) order by t.sort, t.name)
      from public.tables t where t.room_id = any(target_room_ids)
    ), '[]'::jsonb),
    'roomFeatureTags', coalesce((
      select jsonb_agg(to_jsonb(rt))
      from public.room_feature_tags rt
      where rt.con_id = target_con and rt.room_id = any(target_room_ids)
    ), '[]'::jsonb)
  );
exception
  when query_canceled then
    raise sqlstate 'PT504' using message = 'room import timed out';
end;
$$;
revoke all on function public.import_con_rooms(uuid, uuid, uuid[]) from public;
grant execute on function public.import_con_rooms(uuid, uuid, uuid[]) to authenticated;

-- Öffentliche Ausgabe enthält niemals den unveröffentlichten Entwurf.
create or replace function public.get_public_con_floor_plan(target_con uuid)
returns table(document jsonb, revision bigint, published_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select fp.published_document, fp.revision, fp.published_at
  from public.con_floor_plans fp
  join public.cons c on c.id = fp.con_id
  where fp.con_id = target_con
    and c.floor_plan_mode in ('editor', 'both')
    and fp.published_document is not null;
$$;
revoke all on function public.get_public_con_floor_plan(uuid) from public;
grant execute on function public.get_public_con_floor_plan(uuid) to anon, authenticated;

create or replace function public.is_con_admin(target_con uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.is_superadmin() or exists (
    select 1 from public.con_members
    where con_id = target_con and user_id = auth.uid() and status = 'accepted' and role = 'admin'
  );
$$;
revoke all on function public.is_con_admin(uuid) from public;
grant execute on function public.is_con_admin(uuid) to authenticated;

-- Con-Ersteller wird sofort akzeptierter Admin (kein Henne-Ei-Problem)
create or replace function public.add_creator_as_member()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.con_members (con_id, user_id, role, status)
  values (new.id, new.created_by, 'admin', 'accepted')
  on conflict (con_id, user_id) do nothing;
  return new;
end;
$$;
drop trigger if exists cons_after_insert on cons;
create trigger cons_after_insert
  after insert on cons
  for each row execute function public.add_creator_as_member();

-- Einladen per E-Mail (nur Admins), mit Rollenwahl, legt PENDING an — die
-- eingeladene Person muss selbst bestätigen (siehe accept_invite unten).
-- Alte 2-Parameter-Version vorsorglich droppen (siehe Migration v3 für den
-- Grund: sonst entsteht eine parallele, veraltete Überladung).
drop function if exists public.invite_member_to_con(uuid, text);
create or replace function public.invite_member_to_con(target_con uuid, invite_email text, invite_role text default 'editor')
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  found_uid uuid;
begin
  if invite_role not in ('admin','editor') then
    raise exception 'invalid role' using errcode = '22023';
  end if;
  if not public.is_con_admin(target_con) then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  select id into found_uid from auth.users where email = invite_email limit 1;
  if found_uid is null then
    raise exception 'no account found for that email' using errcode = 'P0002';
  end if;
  insert into public.con_members (con_id, user_id, role, status)
  values (target_con, found_uid, invite_role, 'pending')
  on conflict (con_id, user_id) do nothing;
end;
$$;
revoke all on function public.invite_member_to_con(uuid, text, text) from public;
grant execute on function public.invite_member_to_con(uuid, text, text) to authenticated;

create or replace function public.accept_invite(target_con uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.con_members set status = 'accepted'
  where con_id = target_con and user_id = auth.uid() and status = 'pending';
  if not found then
    raise exception 'keine offene Einladung gefunden' using errcode = 'P0002';
  end if;
end;
$$;
revoke all on function public.accept_invite(uuid) from public;
grant execute on function public.accept_invite(uuid) to authenticated;

create or replace function public.decline_invite(target_con uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.con_members
  where con_id = target_con and user_id = auth.uid() and status = 'pending';
end;
$$;
revoke all on function public.decline_invite(uuid) from public;
grant execute on function public.decline_invite(uuid) to authenticated;

create or replace function public.list_my_invites()
returns table(con_id uuid, con_name text, role text)
language sql
stable
security definer
set search_path = ''
as $$
  select cm.con_id, c.name, cm.role
  from public.con_members cm
  join public.cons c on c.id = cm.con_id
  where cm.user_id = auth.uid() and cm.status = 'pending';
$$;
revoke all on function public.list_my_invites() from public;
grant execute on function public.list_my_invites() to authenticated;

-- Crew-Liste (+ E-Mail, Rolle, Status) für die Team-Verwaltung
drop function if exists public.list_con_members(uuid);
create or replace function public.list_con_members(target_con uuid)
returns table(user_id uuid, email text, role text, status text)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_con_member(target_con) then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  return query
    select cm.user_id, u.email::text, cm.role, cm.status
    from public.con_members cm
    join auth.users u on u.id = cm.user_id
    where cm.con_id = target_con;
end;
$$;
revoke all on function public.list_con_members(uuid) from public;
grant execute on function public.list_con_members(uuid) to authenticated;

-- Verhindert, dass der letzte Admin einer Con entfernt/herabgestuft wird
create or replace function public.prevent_removing_last_admin()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Wird durch die "on delete cascade"-Kette beim Löschen der ganzen Con
  -- ausgelöst (con_members hängt an cons), nicht nur durch gezieltes
  -- Entfernen/Herabstufen eines Mitglieds. In dem Fall existiert die Con zu
  -- diesem Zeitpunkt bereits nicht mehr (Elternzeile ist im selben Statement
  -- vorher gelöscht worden) — dann greift der Schutz nicht, sonst könnte eine
  -- Con mit nur einem Admin nie gelöscht werden (Super-Admin eingeschlossen).
  if TG_OP = 'DELETE' and not exists (select 1 from public.cons where id = old.con_id) then
    return old;
  end if;
  if (TG_OP = 'DELETE' and old.role = 'admin' and old.status = 'accepted')
     or (TG_OP = 'UPDATE' and old.role = 'admin' and old.status = 'accepted'
         and (new.role <> 'admin' or new.status <> 'accepted')) then
    if (select count(*) from public.con_members
        where con_id = old.con_id and role = 'admin' and status = 'accepted' and user_id <> old.user_id) = 0 then
      raise exception 'cannot remove or demote the last admin of a Con' using errcode = 'P0001';
    end if;
  end if;
  if TG_OP = 'DELETE' then return old; else return new; end if;
end;
$$;
drop trigger if exists con_members_before_delete on con_members;
drop trigger if exists con_members_before_delete_or_update on con_members;
create trigger con_members_before_delete_or_update
  before delete or update on con_members
  for each row execute function public.prevent_removing_last_admin();

-- Slots für gegebene Tage materialisieren (Crew-only). Schlüssel-Format
-- bewusst "Tag|Bucket-Label" (nicht Bucket-ID) — siehe
-- supabase-migration-v4.sql für die ausführliche Begründung.
create or replace function public.ensure_slots_for_days(target_con uuid, days date[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  d date;
  b record;
begin
  if not public.is_con_member(target_con) then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  foreach d in array days loop
    for b in select * from public.slot_buckets where con_id = target_con and active order by sort loop
      insert into public.slots (con_id, key, label, day, bucket_id, sort)
      values (target_con, d::text || '|' || b.label, to_char(d, 'DD.MM.') || ' ' || b.label, d, b.id, b.sort)
      on conflict (con_id, key) do nothing;
    end loop;
  end loop;
end;
$$;
revoke all on function public.ensure_slots_for_days(uuid, date[]) from public;
grant execute on function public.ensure_slots_for_days(uuid, date[]) to authenticated;

-- ---------- Grants (Least Privilege, unabhängig von Projekt-Defaults) ----------
-- Supabase-Projekte können über Default Privileges bereits weiter gehende
-- Rechte besitzen. Deshalb zuerst alles für die API-Rollen entziehen und
-- anschließend nur die tatsächlich benötigten Operationen freigeben.
revoke all on table
  public.cons, public.con_members, public.rooms, public.tables,
  public.assignments, public.requests, public.slot_buckets, public.slots,
  public.feature_tags, public.room_feature_tags, public.games,
  public.game_required_tags, public.con_floor_plans,
  public.con_floor_plan_versions, public.superadmins
from public, anon, authenticated;

grant select on table
  public.cons, public.rooms, public.tables, public.assignments,
  public.slot_buckets, public.slots, public.feature_tags,
  public.room_feature_tags, public.games, public.game_required_tags
to anon, authenticated;

grant insert on table public.requests to anon, authenticated;

grant insert, update, delete on table public.cons to authenticated;
grant select, insert, update, delete on table
  public.con_members, public.rooms, public.tables, public.assignments,
  public.requests, public.slot_buckets, public.slots, public.games
to authenticated;
grant select on table public.con_floor_plans, public.con_floor_plan_versions to authenticated;
grant insert, delete on table
  public.room_feature_tags, public.game_required_tags
to authenticated;

-- Die RPCs arbeiten mit auth.uid() und sind ausschließlich für echte
-- Supabase-Sitzungen bestimmt. Explizites REVOKE ergänzt das REVOKE von
-- PUBLIC an den Definitionen und bereinigt auch ältere Live-Installationen.
revoke execute on function public.is_superadmin() from anon;
revoke execute on function public.is_con_member(uuid) from anon;
revoke execute on function public.set_con_floor_plan_url(uuid, text) from anon;
revoke execute on function public.set_con_floor_plan_source(uuid, text, text) from anon;
revoke execute on function public.save_con_floor_plan(uuid, bigint, jsonb) from anon;
revoke execute on function public.publish_con_floor_plan(uuid, bigint) from anon;
revoke execute on function public.replace_con_floor_plan(uuid, bigint, jsonb) from anon;
revoke execute on function public.restore_con_floor_plan_version(uuid, uuid, bigint) from anon;
revoke execute on function public.import_con_rooms(uuid, uuid, uuid[]) from anon;
revoke execute on function public.is_con_admin(uuid) from anon;
revoke execute on function public.invite_member_to_con(uuid, text, text) from anon;
revoke execute on function public.accept_invite(uuid) from anon;
revoke execute on function public.decline_invite(uuid) from anon;
revoke execute on function public.list_my_invites() from anon;
revoke execute on function public.list_con_members(uuid) from anon;
revoke execute on function public.ensure_slots_for_days(uuid, date[]) from anon;

-- ---------- Policies: cons ----------
drop policy if exists "public read cons" on cons;
create policy "public read cons" on cons for select using (true);
drop policy if exists "authed create cons" on cons;
create policy "authed create cons" on cons for insert to authenticated
  with check (created_by = auth.uid());
drop policy if exists "members update own con" on cons;
drop policy if exists "admins update own con" on cons;
create policy "admins update own con" on cons for update to authenticated
  using (is_con_admin(id)) with check (is_con_admin(id));
-- Löschen bleibt bewusst auf Super-Admin beschränkt (nicht mal Con-Admins
-- dürfen ihre eigene Con löschen) — zu destruktiv für normale Crew-Rechte.
drop policy if exists "superadmin delete cons" on cons;
create policy "superadmin delete cons" on cons for delete to authenticated
  using (is_superadmin());

-- ---------- Policies: con_floor_plans ----------
drop policy if exists "members read floor plan drafts" on con_floor_plans;
drop policy if exists "superadmins read floor plan drafts" on con_floor_plans;
create policy "members read floor plan drafts" on con_floor_plans for select to authenticated
  using (is_con_member(con_id));

-- ---------- Policies: con_floor_plan_versions ----------
drop policy if exists "members read floor plan versions" on con_floor_plan_versions;
drop policy if exists "superadmins read floor plan versions" on con_floor_plan_versions;
create policy "members read floor plan versions" on con_floor_plan_versions for select to authenticated
  using (is_con_member(con_id));

-- ---------- Policies: con_members ----------
drop policy if exists "members read own con roster" on con_members;
create policy "members read own con roster" on con_members for select to authenticated
  using (is_con_member(con_id));
drop policy if exists "members add teammates" on con_members;
drop policy if exists "admins add teammates" on con_members;
create policy "admins add teammates" on con_members for insert to authenticated
  with check (is_con_admin(con_id));
drop policy if exists "members remove teammates" on con_members;
drop policy if exists "admins or self remove" on con_members;
create policy "admins or self remove" on con_members for delete to authenticated
  using (is_con_admin(con_id) or user_id = auth.uid());
drop policy if exists "admins update roles" on con_members;
create policy "admins update roles" on con_members for update to authenticated
  using (is_con_admin(con_id))
  with check (is_con_admin(con_id));

-- ---------- Policies: rooms / tables / assignments ----------
drop policy if exists "public read rooms" on rooms;
create policy "public read rooms" on rooms for select using (true);
drop policy if exists "orga write rooms" on rooms;
drop policy if exists "members write rooms" on rooms;
create policy "members write rooms" on rooms for all to authenticated
  using (is_con_member(con_id)) with check (is_con_member(con_id));

drop policy if exists "public read tables" on tables;
create policy "public read tables" on tables for select using (true);
drop policy if exists "orga write tables" on tables;
drop policy if exists "members write tables" on tables;
create policy "members write tables" on tables for all to authenticated
  using (is_con_member(con_id)) with check (is_con_member(con_id));

drop policy if exists "public read assignments" on assignments;
create policy "public read assignments" on assignments for select using (true);
drop policy if exists "orga write assignments" on assignments;
drop policy if exists "members write assignments" on assignments;
create policy "members write assignments" on assignments for all to authenticated
  using (is_con_member(con_id)) with check (is_con_member(con_id));

-- ---------- Policies: requests (kein anonymes Lesen — nur einreichen) ----------
drop policy if exists "anon insert requests" on requests;
create policy "anon insert requests" on requests for insert to anon, authenticated
  with check (status = 'offen' and orga_notiz is null and char_length(message) between 10 and 2000);
drop policy if exists "orga read requests" on requests;
drop policy if exists "public read requests" on requests;
drop policy if exists "members read requests" on requests;
create policy "members read requests" on requests for select to authenticated
  using (is_con_member(con_id));
drop policy if exists "orga update requests" on requests;
drop policy if exists "members update requests" on requests;
create policy "members update requests" on requests for update to authenticated
  using (is_con_member(con_id)) with check (is_con_member(con_id));
drop policy if exists "orga delete requests" on requests;
drop policy if exists "members delete requests" on requests;
create policy "members delete requests" on requests for delete to authenticated
  using (is_con_member(con_id));

-- ---------- Policies: slot_buckets / slots (öffentlich lesen, Crew schreibt) ----------
drop policy if exists "public read slot_buckets" on slot_buckets;
create policy "public read slot_buckets" on slot_buckets for select using (true);
drop policy if exists "members write slot_buckets" on slot_buckets;
create policy "members write slot_buckets" on slot_buckets for all to authenticated
  using (is_con_member(con_id)) with check (is_con_member(con_id));

drop policy if exists "public read slots" on slots;
create policy "public read slots" on slots for select using (true);
drop policy if exists "members write slots" on slots;
create policy "members write slots" on slots for all to authenticated
  using (is_con_member(con_id)) with check (is_con_member(con_id));

-- ---------- Policies: feature_tags (global, nur per SQL-Konsole erweiterbar) ----------
drop policy if exists "public read feature_tags" on feature_tags;
create policy "public read feature_tags" on feature_tags for select using (true);
-- Bewusst KEINE Insert/Update/Delete-Policy — siehe Kommentar bei superadmins.

-- ---------- Policies: room_feature_tags (öffentlich lesen, Crew togglet) ----------
drop policy if exists "public read room_feature_tags" on room_feature_tags;
create policy "public read room_feature_tags" on room_feature_tags for select using (true);
drop policy if exists "members write room_feature_tags" on room_feature_tags;
create policy "members write room_feature_tags" on room_feature_tags for all to authenticated
  using (is_con_member(con_id)) with check (is_con_member(con_id));

-- ---------- Policies: games (öffentlich lesen, Crew schreibt) ----------
drop policy if exists "public read games" on games;
create policy "public read games" on games for select using (true);
drop policy if exists "members write games" on games;
create policy "members write games" on games for all to authenticated
  using (is_con_member(con_id)) with check (is_con_member(con_id));

-- ---------- Policies: game_required_tags (öffentlich lesen, Crew togglet) ----------
drop policy if exists "public read game_required_tags" on game_required_tags;
create policy "public read game_required_tags" on game_required_tags for select using (true);
drop policy if exists "members write game_required_tags" on game_required_tags;
create policy "members write game_required_tags" on game_required_tags for all to authenticated
  using (is_con_member(con_id)) with check (is_con_member(con_id));

-- ---------- Seed: kontrollierte Vokabelliste für Raum-Eigenschaften ----------
insert into feature_tags (key, label, sort) values
  ('barrierefrei', '♿ barrierefrei', 0),
  ('ruhig', '🤫 ruhig', 1),
  ('laut_ok', '🔊 laut ok', 2),
  ('bewegung', '🕺 Bewegung ok', 3),
  ('tageslicht', '☀️ Tageslicht', 4),
  ('kuehl', '❄️ eher kühl', 5),
  ('akustisch_gut', '👂 akustisch gut', 6)
on conflict (key) do nothing;
