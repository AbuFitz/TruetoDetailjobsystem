-- True To Detail Job System — detailer profiles.
--
-- Same pattern as FixNow Mechanics Tracking's `engineers`: a detailer gets a
-- persistent, unauthenticated link (/d/<link_token>) that shows their
-- assigned jobs and lets them run the mobile job workflow — start journey,
-- arrived, check-in, stage checklist, handover — from their own phone, with
-- no login. Staff manage detailer profiles from the admin console.

create table if not exists public.detailers (
  id uuid primary key default gen_random_uuid(),
  link_token text unique not null default public.generate_link_token(),

  name text not null,
  phone text,
  job_title text,
  bio text,
  vehicle_description text,
  photo_url text,

  active boolean not null default true,
  created_at timestamptz not null default now()
);

comment on table public.detailers is
  'True To Detail detailer profiles. link_token is a persistent, '
  'unauthenticated credential for /d/<link_token> — treat it like a password.';

create index if not exists detailers_link_token_idx on public.detailers (link_token);

alter table public.detailers enable row level security;

drop policy if exists "Staff full access" on public.detailers;
create policy "Staff full access"
  on public.detailers
  for all
  to authenticated
  using (public.is_staff())
  with check (public.is_staff());

revoke all on public.detailers from anon, public;
grant select, insert, update, delete on public.detailers to authenticated;

-- ---------------------------------------------------------------------------
-- Storage: detailer profile photos. Public read (customer dashboard and
-- live-job card render these unauthenticated-ish, i.e. without a separate
-- signed-URL step), staff-only write.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('detailer-photos', 'detailer-photos', true)
on conflict (id) do nothing;

drop policy if exists "Public read detailer photos" on storage.objects;
create policy "Public read detailer photos"
  on storage.objects for select
  to public
  using (bucket_id = 'detailer-photos');

drop policy if exists "Staff manage detailer photos" on storage.objects;
create policy "Staff manage detailer photos"
  on storage.objects for all
  to authenticated
  using (bucket_id = 'detailer-photos' and public.is_staff())
  with check (bucket_id = 'detailer-photos' and public.is_staff());
