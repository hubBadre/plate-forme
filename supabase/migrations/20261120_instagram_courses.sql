-- Link-based Instagram course library. Apply once to the existing Supabase project.
create table if not exists public.instagram_courses (
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

drop trigger if exists instagram_course_class_level on public.instagram_courses;
create trigger instagram_course_class_level
before insert or update of class_id, level on public.instagram_courses
for each row execute procedure public.validate_class_level();

alter table public.instagram_courses enable row level security;

drop policy if exists "approved users see published Instagram courses" on public.instagram_courses;
create policy "approved users see published Instagram courses"
on public.instagram_courses for select to authenticated
using (
  public.is_approved_user()
  and (public.has_staff_role() or (published and (class_id is null or public.is_class_member(class_id))))
);

drop policy if exists "staff manage Instagram courses" on public.instagram_courses;
create policy "staff manage Instagram courses"
on public.instagram_courses for all to authenticated
using (public.has_staff_role())
with check (public.has_staff_role());

grant select, insert, update, delete on public.instagram_courses to authenticated;
