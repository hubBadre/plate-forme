-- Cours du soir: initial schema. Run in a new Supabase project's SQL editor.
create extension if not exists pgcrypto;

create type public.app_role as enum ('student', 'teacher', 'admin');
create type public.account_status as enum ('pending', 'active', 'suspended');
create type public.school_level as enum ('Tronc Commun', '1BAC', '2BAC');
create type public.school_subject as enum ('Mathématiques', 'Physique', 'Chimie');
create type public.live_status as enum ('scheduled', 'live', 'ended', 'cancelled');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  first_name text not null default '',
  last_name text not null default '',
  role public.app_role not null default 'student',
  level public.school_level,
  status public.account_status not null default 'pending',
  approved_at timestamptz,
  approved_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint approval_state check ((status = 'active' and (role <> 'student' or approved_at is not null)) or status <> 'active')
);

create table public.classes (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  level public.school_level not null,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now()
);
create table public.class_members (
  class_id uuid not null references public.classes(id) on delete cascade,
  student_id uuid not null references public.profiles(id) on delete cascade,
  added_at timestamptz not null default now(),
  primary key(class_id, student_id)
);

create table public.live_sessions (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text not null default '',
  level public.school_level not null,
  subject public.school_subject not null,
  chapter text not null default '',
  class_id uuid references public.classes(id) on delete set null,
  host_id uuid not null references public.profiles(id),
  scheduled_at timestamptz not null,
  status public.live_status not null default 'scheduled',
  recording_path text,
  recording_egress_id text,
  room_name text not null unique default ('class-' || replace(gen_random_uuid()::text, '-', '')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table public.replays (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text not null default '',
  level public.school_level not null,
  subject public.school_subject not null,
  chapter text not null,
  storage_path text not null unique,
  duration_seconds integer check (duration_seconds is null or duration_seconds >= 0),
  published boolean not null default false,
  class_id uuid references public.classes(id) on delete set null,
  uploaded_by uuid not null references public.profiles(id),
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table public.resources (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text not null default '',
  kind text not null check (kind in ('pdf', 'exercise', 'correction')),
  level public.school_level not null,
  subject public.school_subject not null,
  chapter text not null default '',
  storage_path text not null unique,
  class_id uuid references public.classes(id) on delete set null,
  published boolean not null default false,
  uploaded_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now()
);
create table public.instagram_courses (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 1 and 140),
  url text not null check (url ~* '^https?://([a-z0-9-]+\.)*(instagram\.com|instagr\.am)(/|$)'),
  description text not null default '',
  level public.school_level not null,
  subject public.school_subject not null,
  chapter text not null default '',
  class_id uuid references public.classes(id) on delete set null,
  published boolean not null default false,
  added_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now()
);
create table public.facebook_courses (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 1 and 140),
  url text not null check (url ~* '^https?://([a-z0-9-]+\.)*(facebook\.com|fb\.watch|fb\.me)(/|$)'),
  description text not null default '',
  level public.school_level not null,
  subject public.school_subject not null,
  chapter text not null default '',
  class_id uuid references public.classes(id) on delete set null,
  published boolean not null default false,
  added_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now()
);

create or replace function public.validate_class_level()
returns trigger language plpgsql set search_path = '' as $$
declare class_level public.school_level;
begin
  if new.class_id is not null then
    select c.level into class_level from public.classes c where c.id = new.class_id;
    if class_level is distinct from new.level then raise exception 'Class level must match content level'; end if;
  end if;
  return new;
end;
$$;
create trigger live_class_level before insert or update of class_id, level on public.live_sessions for each row execute procedure public.validate_class_level();
create trigger replay_class_level before insert or update of class_id, level on public.replays for each row execute procedure public.validate_class_level();
create trigger resource_class_level before insert or update of class_id, level on public.resources for each row execute procedure public.validate_class_level();
create trigger instagram_course_class_level before insert or update of class_id, level on public.instagram_courses for each row execute procedure public.validate_class_level();
create trigger facebook_course_class_level before insert or update of class_id, level on public.facebook_courses for each row execute procedure public.validate_class_level();

create or replace function public.validate_student_class_level()
returns trigger language plpgsql set search_path = '' as $$
declare class_level public.school_level; student_level public.school_level;
begin
  select c.level into class_level from public.classes c where c.id = new.class_id;
  select p.level into student_level from public.profiles p where p.id = new.student_id and p.role = 'student';
  if class_level is null or student_level is distinct from class_level then raise exception 'Student level must match class level'; end if;
  return new;
end;
$$;
create trigger class_member_level before insert or update of class_id, student_id on public.class_members for each row execute procedure public.validate_student_class_level();

create or replace function public.is_approved_user()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.profiles p where p.id = (select auth.uid()) and p.status = 'active' and (p.role <> 'student' or p.approved_at is not null));
$$;
create or replace function public.has_staff_role()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.profiles p where p.id = (select auth.uid()) and p.status = 'active' and p.role in ('teacher', 'admin'));
$$;
create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.profiles p where p.id = (select auth.uid()) and p.status = 'active' and p.role = 'admin');
$$;
create or replace function public.is_class_member(target_class uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.class_members cm where cm.class_id = target_class and cm.student_id = (select auth.uid()));
$$;

-- New email signups receive a pending student profile. Staff accounts must be
-- provisioned by a trusted administrator; never grant staff from browser input.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles(id, email, first_name, last_name, role, level, status)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'first_name',''), coalesce(new.raw_user_meta_data->>'last_name',''), 'student', nullif(new.raw_user_meta_data->>'level','')::public.school_level, 'pending');
  return new;
end;
$$;
create trigger on_auth_user_created after insert on auth.users for each row execute procedure public.handle_new_user();

alter table public.profiles enable row level security;
alter table public.classes enable row level security;
alter table public.class_members enable row level security;
alter table public.live_sessions enable row level security;
alter table public.replays enable row level security;
alter table public.resources enable row level security;
alter table public.instagram_courses enable row level security;
alter table public.facebook_courses enable row level security;

create policy "profiles read own or staff" on public.profiles for select to authenticated using (id = (select auth.uid()) or public.has_staff_role());
-- Only basic profile fields are client-updatable. Account approval/status and
-- roles are changed through the staff-only RPC below, never direct table edits.
create policy "student update own basic profile" on public.profiles for update to authenticated using (id = (select auth.uid()) and role = 'student' and status <> 'suspended') with check (id = (select auth.uid()) and role = 'student' and status <> 'suspended');
grant update (first_name, last_name) on public.profiles to authenticated;

create or replace function public.set_student_status(target_id uuid, target_status public.account_status)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.has_staff_role() then raise exception 'Staff access required' using errcode = '42501'; end if;
  if not exists(select 1 from public.profiles where id = target_id and role = 'student') then raise exception 'Student account not found'; end if;
  update public.profiles
    set status = target_status,
        approved_at = case when target_status = 'active' then coalesce(approved_at, now()) else approved_at end,
        approved_by = case when target_status = 'active' then (select auth.uid()) else approved_by end,
        updated_at = now()
    where id = target_id;
end;
$$;
revoke all on function public.set_student_status(uuid, public.account_status) from public;
grant execute on function public.set_student_status(uuid, public.account_status) to authenticated;

create policy "classes visible to members and staff" on public.classes for select to authenticated using (public.has_staff_role() or public.is_class_member(id));
create policy "staff manage classes" on public.classes for all to authenticated using (public.has_staff_role()) with check (public.has_staff_role());
create policy "members visible to staff or self" on public.class_members for select to authenticated using (public.has_staff_role() or student_id = (select auth.uid()));
create policy "staff manage members" on public.class_members for all to authenticated using (public.has_staff_role()) with check (public.has_staff_role());

create policy "approved users see relevant lives" on public.live_sessions for select to authenticated using (
  public.is_approved_user() and (public.has_staff_role() or (class_id is not null and public.is_class_member(class_id)))
);
create policy "staff manage lives" on public.live_sessions for all to authenticated using (public.has_staff_role()) with check (public.has_staff_role());
create policy "approved users see published replays" on public.replays for select to authenticated using (
  public.is_approved_user() and (public.has_staff_role() or (published and (class_id is null or public.is_class_member(class_id))))
);
create policy "staff manage replays" on public.replays for all to authenticated using (public.has_staff_role()) with check (public.has_staff_role());
create policy "approved users see published resources" on public.resources for select to authenticated using (
  public.is_approved_user() and (public.has_staff_role() or (published and (class_id is null or public.is_class_member(class_id))))
);
create policy "staff manage resources" on public.resources for all to authenticated using (public.has_staff_role()) with check (public.has_staff_role());
create policy "approved users see published Instagram courses" on public.instagram_courses for select to authenticated using (
  public.is_approved_user() and (public.has_staff_role() or (published and (class_id is null or public.is_class_member(class_id))))
);
create policy "staff manage Instagram courses" on public.instagram_courses for all to authenticated using (public.has_staff_role()) with check (public.has_staff_role());
create policy "approved users see published Facebook courses" on public.facebook_courses for select to authenticated using (
  public.is_approved_user() and (public.has_staff_role() or (published and (class_id is null or public.is_class_member(class_id))))
);
create policy "staff manage Facebook courses" on public.facebook_courses for all to authenticated using (public.has_staff_role()) with check (public.has_staff_role());

-- Private storage: store opaque object paths in rows and issue short-lived signed URLs only after RLS checks.
insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values ('private-lessons', 'private-lessons', false, 2147483648, array['video/mp4','video/webm','application/pdf'])
on conflict (id) do update set public = false, file_size_limit = 2147483648, allowed_mime_types = excluded.allowed_mime_types;
create policy "staff upload private lesson files" on storage.objects for insert to authenticated with check (bucket_id = 'private-lessons' and public.has_staff_role());
create policy "staff update private lesson files" on storage.objects for update to authenticated using (bucket_id = 'private-lessons' and public.has_staff_role()) with check (bucket_id = 'private-lessons' and public.has_staff_role());
create policy "staff delete private lesson files" on storage.objects for delete to authenticated using (bucket_id = 'private-lessons' and public.has_staff_role());
create policy "approved users download authorized lesson files" on storage.objects for select to authenticated using (
  bucket_id = 'private-lessons' and public.is_approved_user() and (
    public.has_staff_role()
    or exists(select 1 from public.replays r where r.storage_path = name and r.published and (r.class_id is null or public.is_class_member(r.class_id)))
    or exists(select 1 from public.resources d where d.storage_path = name and d.published and (d.class_id is null or public.is_class_member(d.class_id)))
  )
);

grant usage on schema public to authenticated;
revoke update on public.profiles from authenticated;
grant select on public.profiles to authenticated;
grant select, insert, update, delete on public.classes, public.class_members, public.live_sessions, public.replays, public.resources to authenticated;
grant select, insert, update, delete on public.instagram_courses to authenticated;
grant select, insert, update, delete on public.facebook_courses to authenticated;
