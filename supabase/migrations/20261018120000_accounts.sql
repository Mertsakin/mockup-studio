-- Accounts, cloud projects and media (docs/uyelik.md §3). Every row belongs to one user; row level security lets each
-- user see and change only their own. Files live in R2 behind the storage Worker (services/storage/); these tables
-- keep what is where, sizes and the per-user quota (beta: 2 GB, 100 projects).

create table public.profiles (
  id uuid primary key references auth.users on delete cascade,
  name text,
  avatar_url text,
  plan text not null default 'beta',
  storage_bytes bigint not null default 0 check (storage_bytes >= 0),
  created_at timestamptz not null default now()
);

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null default auth.uid() references public.profiles on delete cascade,
  name text not null default 'Adsız proje' check (char_length(name) between 1 and 120),
  version int not null default 0,
  doc_key text,
  thumb_key text,
  boards int not null default 0,
  bytes bigint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index projects_owner_updated on public.projects (owner, updated_at desc);

create table public.media (
  owner uuid not null references public.profiles on delete cascade,
  hash text not null check (hash ~ '^[0-9a-f]{64}$'),
  bytes bigint not null check (bytes > 0),
  type text not null,
  created_at timestamptz not null default now(),
  primary key (owner, hash)
);

create table public.project_media (
  project uuid not null references public.projects on delete cascade,
  owner uuid not null default auth.uid() references public.profiles on delete cascade,
  hash text not null,
  primary key (project, hash),
  foreign key (owner, hash) references public.media (owner, hash) on delete cascade
);

-- the plan's limits in one place
create table public.plan_limits (
  plan text primary key,
  max_bytes bigint not null,
  max_projects int not null
);
insert into public.plan_limits values ('beta', 2147483648, 100);

alter table public.profiles enable row level security;
alter table public.projects enable row level security;
alter table public.media enable row level security;
alter table public.project_media enable row level security;
alter table public.plan_limits enable row level security;

create policy "own profile: read" on public.profiles for select using (id = auth.uid());
-- a user may change their name and avatar only (plan and storage_bytes are the server's)
create policy "own profile: update" on public.profiles for update using (id = auth.uid()) with check (id = auth.uid());
revoke update on public.profiles from authenticated, anon;
grant update (name, avatar_url) on public.profiles to authenticated;

create policy "own projects" on public.projects for all using (owner = auth.uid()) with check (owner = auth.uid());
-- version, doc_key and bytes change only through save_project (optimistic lock); the client may rename and trash
revoke update on public.projects from authenticated, anon;
grant update (name, deleted_at, thumb_key) on public.projects to authenticated;

create policy "own media: read" on public.media for select using (owner = auth.uid());
-- media rows are written by add_media (quota) only
revoke insert, update, delete on public.media from authenticated, anon;

create policy "own project media" on public.project_media for all using (owner = auth.uid()) with check (owner = auth.uid());
create policy "limits: read" on public.plan_limits for select using (true);

-- a profile for every new user (name and avatar from the provider when there is one)
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, name, avatar_url)
  values (new.id,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
    new.raw_user_meta_data->>'avatar_url');
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

-- the project count limit (trashed projects count until they are purged)
create function public.check_project_limit() returns trigger
language plpgsql security definer set search_path = '' as $$
declare lim int;
begin
  select l.max_projects into lim from public.profiles p join public.plan_limits l on l.plan = p.plan where p.id = new.owner;
  if (select count(*) from public.projects where owner = new.owner) >= coalesce(lim, 0) then
    raise exception 'project_limit' using errcode = 'P0001', hint = 'Proje sınırına ulaştın.';
  end if;
  return new;
end $$;
create trigger projects_limit before insert on public.projects for each row execute function public.check_project_limit();

/* A stored file. Called by the storage Worker (with the user's own token) after the object is in R2; records it once
   per user and counts it against the quota. Over the quota: raises 'quota' and the Worker deletes the object. A file
   the user already has is free (content addressed). Returns true when it was new. */
create function public.add_media(p_hash text, p_bytes bigint, p_type text) returns boolean
language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); lim bigint; used bigint;
begin
  if uid is null then raise exception 'auth' using errcode = '28000'; end if;
  if exists (select 1 from public.media where owner = uid and hash = p_hash) then return false; end if;
  select p.storage_bytes, l.max_bytes into used, lim from public.profiles p join public.plan_limits l on l.plan = p.plan where p.id = uid for update of p;
  if used + p_bytes > lim then raise exception 'quota' using errcode = 'P0001', hint = 'Depolama alanın doldu.'; end if;
  insert into public.media (owner, hash, bytes, type) values (uid, p_hash, p_bytes, p_type);
  update public.profiles set storage_bytes = storage_bytes + p_bytes where id = uid;
  return true;
end $$;

/* Saves a project version (optimistic lock): succeeds only when the stored version is still p_expected, then stores the
   document's key, size and media list and returns the new version. Someone saved in between: returns -1 (the client
   asks what to do). The media must already be the user's (add_media). */
create function public.save_project(p_id uuid, p_expected int, p_doc_key text, p_bytes bigint, p_boards int, p_hashes text[], p_name text default null)
returns int language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); v int;
begin
  if uid is null then raise exception 'auth' using errcode = '28000'; end if;
  update public.projects set version = version + 1, doc_key = p_doc_key, bytes = p_bytes, boards = p_boards,
    name = coalesce(p_name, name), updated_at = now()
    where id = p_id and owner = uid and version = p_expected and deleted_at is null
    returning version into v;
  if v is null then
    if not exists (select 1 from public.projects where id = p_id and owner = uid) then raise exception 'not_found' using errcode = 'P0002'; end if;
    return -1;
  end if;
  delete from public.project_media where project = p_id;
  insert into public.project_media (project, owner, hash) select p_id, uid, h from unnest(p_hashes) as h
    where exists (select 1 from public.media where owner = uid and hash = h);
  return v;
end $$;

/* Media no project uses any more (purged projects, replaced screenshots): the nightly clean-up deletes the R2 objects,
   then calls forget_media for them. Service role only. */
create function public.orphan_media(p_older_than interval default '1 day')
returns table (owner uuid, hash text, bytes bigint) language sql security definer set search_path = '' as $$
  select m.owner, m.hash, m.bytes from public.media m
  where m.created_at < now() - p_older_than
    and not exists (select 1 from public.project_media pm where pm.owner = m.owner and pm.hash = m.hash);
$$;
create function public.forget_media(p_owner uuid, p_hash text) returns void
language plpgsql security definer set search_path = '' as $$
declare b bigint;
begin
  delete from public.media where owner = p_owner and hash = p_hash returning bytes into b;
  if b is not null then update public.profiles set storage_bytes = greatest(0, storage_bytes - b) where id = p_owner; end if;
end $$;
revoke execute on function public.orphan_media, public.forget_media from public, anon, authenticated;
revoke execute on function public.handle_new_user, public.check_project_limit from public, anon, authenticated;
grant execute on function public.add_media, public.save_project to authenticated;
