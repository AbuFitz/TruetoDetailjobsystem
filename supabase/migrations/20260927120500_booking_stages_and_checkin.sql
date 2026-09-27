-- True To Detail Job System — the detail-in-progress checklist and the
-- customer check-in record.
--
-- Two distinct things the product brief is careful to keep separate:
--   * booking_stage_progress — the lightweight sub-status shown to the
--     customer under IN_PROGRESS ("Initial inspection ✓ / Wheels & pre-wash
--     ✓ / Exterior wash ● / Interior ○ / Protection ○ / Final QC ○"). Just
--     six checkboxes, not a place to record findings.
--   * check_ins — what the detailer actually records when they reach the
--     customer's address and start the vehicle inspection: mileage, existing
--     damage, valuables, access considerations, water/electric availability,
--     customer requests, and the customer's own acknowledgement of all of
--     it. One per booking.

create table if not exists public.booking_stage_progress (
  booking_id uuid not null references public.bookings(id) on delete cascade,
  stage_key text not null check (stage_key in (
    'initial_inspection', 'wheels_prewash', 'exterior_wash', 'interior', 'protection', 'final_qc'
  )),
  completed_at timestamptz,

  primary key (booking_id, stage_key)
);

comment on table public.booking_stage_progress is
  'Detail-in-progress checklist under a booking''s IN_PROGRESS status — see '
  'DETAIL_STAGE_KEYS in src/lib/constants.ts. completed_at null = not yet '
  'reached; the frontend renders the first null row as the "current" (●) '
  'stage and everything after it as upcoming (○).';

alter table public.booking_stage_progress enable row level security;

drop policy if exists "Customers read own stage progress" on public.booking_stage_progress;
create policy "Customers read own stage progress"
  on public.booking_stage_progress for select
  to authenticated
  using (
    public.is_staff()
    or exists (
      select 1 from public.bookings b
      where b.id = booking_stage_progress.booking_id and b.customer_id = auth.uid()
    )
  );

drop policy if exists "Staff manage stage progress" on public.booking_stage_progress;
create policy "Staff manage stage progress"
  on public.booking_stage_progress for all
  to authenticated
  using (public.is_staff())
  with check (public.is_staff());

revoke all on public.booking_stage_progress from anon, public;
grant select on public.booking_stage_progress to authenticated;
grant insert, update, delete on public.booking_stage_progress to authenticated;

-- ---------------------------------------------------------------------------
-- Check-ins — everything the product brief lists under "check-in means the
-- detailer inspecting the car at the customer's address": mileage, existing
-- bodywork/wheel damage, interior condition, valuables/items, access
-- considerations, water/electric availability, where the vehicle is
-- positioned, any issue blocking the booked service, customer requests, and
-- finally the customer's own acknowledgement (tap-to-confirm — see
-- customer_ack_at/customer_ack_name — a real signature capture is future
-- work, not V1).
-- ---------------------------------------------------------------------------
create table if not exists public.check_ins (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null unique references public.bookings(id) on delete cascade,

  mileage int check (mileage >= 0),
  exterior_damage_notes text,
  wheel_damage_notes text,
  interior_condition_notes text,
  valuables_notes text,
  customer_requests text,
  access_notes text,
  water_available boolean,
  electric_available boolean,
  vehicle_position_notes text,
  blocking_issue text,

  created_at timestamptz not null default now(),
  customer_ack_at timestamptz,
  customer_ack_name text
);

comment on table public.check_ins is
  'The on-arrival vehicle/property inspection record — one per booking. '
  'Written by the assigned detailer via detailer_submit_check_in().';

create index if not exists check_ins_booking_id_idx on public.check_ins (booking_id);

alter table public.check_ins enable row level security;

drop policy if exists "Customers read own check-ins" on public.check_ins;
create policy "Customers read own check-ins"
  on public.check_ins for select
  to authenticated
  using (
    public.is_staff()
    or exists (select 1 from public.bookings b where b.id = check_ins.booking_id and b.customer_id = auth.uid())
  );

drop policy if exists "Staff manage check-ins" on public.check_ins;
create policy "Staff manage check-ins"
  on public.check_ins for all
  to authenticated
  using (public.is_staff())
  with check (public.is_staff());

revoke all on public.check_ins from anon, public;
grant select on public.check_ins to authenticated;
grant insert, update, delete on public.check_ins to authenticated;

-- ---------------------------------------------------------------------------
-- Check-in photos — "photos around the vehicle".
-- ---------------------------------------------------------------------------
create table if not exists public.check_in_photos (
  id uuid primary key default gen_random_uuid(),
  check_in_id uuid not null references public.check_ins(id) on delete cascade,
  url text not null,
  caption text,
  created_at timestamptz not null default now()
);

create index if not exists check_in_photos_check_in_id_idx on public.check_in_photos (check_in_id);

alter table public.check_in_photos enable row level security;

drop policy if exists "Customers read own check-in photos" on public.check_in_photos;
create policy "Customers read own check-in photos"
  on public.check_in_photos for select
  to authenticated
  using (
    public.is_staff()
    or exists (
      select 1
      from public.check_ins ci
      join public.bookings b on b.id = ci.booking_id
      where ci.id = check_in_photos.check_in_id and b.customer_id = auth.uid()
    )
  );

drop policy if exists "Staff manage check-in photos" on public.check_in_photos;
create policy "Staff manage check-in photos"
  on public.check_in_photos for all
  to authenticated
  using (public.is_staff())
  with check (public.is_staff());

revoke all on public.check_in_photos from anon, public;
grant select on public.check_in_photos to authenticated;
grant insert, update, delete on public.check_in_photos to authenticated;

-- ---------------------------------------------------------------------------
-- Storage: check-in photos. Public read (same rationale as detailer-photos
-- — the customer dashboard and admin console render these without a signed-
-- URL round trip). Insert is deliberately open to anon: unlike every other
-- write in this app, the detailer app (/d/<token>) is unauthenticated, and
-- plpgsql can't call the Storage API directly (the same constraint FixNow's
-- engineer-update-profile Edge Function exists to work around). A dedicated
-- Edge Function is the stricter alternative — see README "Future work" —
-- but for V1 an open-insert bucket of low-sensitivity vehicle photos, with
-- every *table* write still going through the token-gated
-- detailer_add_check_in_photo() RPC, is a deliberate, bounded relaxation.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('check-in-photos', 'check-in-photos', true)
on conflict (id) do nothing;

drop policy if exists "Public read check-in photos" on storage.objects;
create policy "Public read check-in photos"
  on storage.objects for select
  to public
  using (bucket_id = 'check-in-photos');

drop policy if exists "Anyone can upload check-in photos" on storage.objects;
create policy "Anyone can upload check-in photos"
  on storage.objects for insert
  to anon, authenticated
  with check (bucket_id = 'check-in-photos');

drop policy if exists "Staff manage check-in photos in storage" on storage.objects;
create policy "Staff manage check-in photos in storage"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'check-in-photos' and public.is_staff())
  with check (bucket_id = 'check-in-photos' and public.is_staff());

drop policy if exists "Staff delete check-in photos in storage" on storage.objects;
create policy "Staff delete check-in photos in storage"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'check-in-photos' and public.is_staff());
