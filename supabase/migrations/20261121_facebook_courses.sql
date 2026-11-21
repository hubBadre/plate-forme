-- Link-based Facebook course library. Apply once to the existing Supabase project.
create table if not exists public.facebook_courses (
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

drop trigger if exists facebook_course_class_level on public.facebook_courses;
create trigger facebook_course_class_level
before insert or update of class_id, level on public.facebook_courses
for each row execute procedure public.validate_class_level();

alter table public.facebook_courses enable row level security;

drop policy if exists "approved users see published Facebook courses" on public.facebook_courses;
create policy "approved users see published Facebook courses"
on public.facebook_courses for select to authenticated
using (
  public.is_approved_user()
  and (public.has_staff_role() or (published and (class_id is null or public.is_class_member(class_id))))
);

drop policy if exists "staff manage Facebook courses" on public.facebook_courses;
create policy "staff manage Facebook courses"
on public.facebook_courses for all to authenticated
using (public.has_staff_role())
with check (public.has_staff_role());

grant select, insert, update, delete on public.facebook_courses to authenticated;
