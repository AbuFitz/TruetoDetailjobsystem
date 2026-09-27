-- True To Detail Job System — bookings. The core of the whole system.
--
-- This is the mobile job workflow described in the product brief, not a
-- workshop one: there is no "vehicle arrives", no bay, no drop-off/
-- collection, no reception desk. A booking's status walks through the
-- detailer travelling TO the customer, not the other way round:
--
--   CONFIRMED -> ASSIGNED -> EN_ROUTE -> ARRIVED -> CHECK_IN -> IN_PROGRESS
--   -> QC -> HANDOVER -> COMPLETED            (or -> CANCELLED at any point)
--
-- fulfilment_type exists from day one specifically so a future studio/drop-
-- off offering can be added as a *second* fulfilment type later without
-- retrofitting workshop concepts into this table — see the product brief's
-- "MOBILE / STUDIO" note. Every column below assumes MOBILE; a STUDIO type
-- would need its own additional columns and its own status vocabulary, not
-- reuse en_route/arrived/check_in as-is.

-- Booking reference generator — human-readable, unlike the detailer
-- link_token or a future customer-facing share link. "TTD-" + 8 uppercase
-- hex chars, e.g. "TTD-4F2A9C3B". Collisions are astronomically unlikely at
-- this business's volume; the unique constraint on the column below is the
-- real backstop. Defined before the table so it can be used as its default.
create or replace function public.generate_booking_reference()
returns text
language sql
volatile
as $$
  select 'TTD-' || upper(encode(gen_random_bytes(4), 'hex'));
$$;

create table if not exists public.bookings (
  id uuid primary key default gen_random_uuid(),
  booking_reference text unique not null default public.generate_booking_reference(),

  customer_id uuid not null references public.customers(id) on delete restrict,
  vehicle_id uuid references public.vehicles(id) on delete set null,
  address_id uuid references public.customer_addresses(id) on delete set null,

  fulfilment_type text not null default 'MOBILE' check (fulfilment_type in ('MOBILE', 'STUDIO')),

  -- Service address is snapshotted onto the booking at creation time (not
  -- just referenced via address_id) so editing/deleting a saved address
  -- later never moves a booking that's already scheduled, in progress, or
  -- completed — same principle as FixNow snapshotting technician_name.
  service_address_line1 text not null,
  service_address_line2 text,
  service_address_city text,
  service_postcode text not null,
  destination_lat double precision,
  destination_lng double precision,

  -- Vehicle is likewise snapshotted (registration/description) so a booking
  -- still reads correctly even if the customer edits or deletes the vehicle
  -- record afterwards.
  vehicle_registration text not null,
  vehicle_description text,

  package_id text not null,
  package_name text not null,
  vehicle_size text not null check (vehicle_size in ('small', 'midsize', 'largesuv')),
  addon_ids text[] not null default '{}',
  addon_labels text[] not null default '{}',
  price numeric(8, 2) not null check (price >= 0),

  scheduled_start timestamptz not null,
  estimated_duration_minutes int not null check (estimated_duration_minutes > 0),
  -- Admin-entered (or, later, routing-computed) travel time immediately
  -- before this job on the assigned detailer's schedule — what renders as
  -- "↓ 18 min travel" between blocks on the admin schedule. Null until a
  -- detailer is assigned and the gap is known.
  travel_time_minutes int check (travel_time_minutes >= 0),

  assigned_detailer_id uuid references public.detailers(id) on delete set null,

  status text not null default 'confirmed' check (status in (
    'confirmed', 'assigned', 'en_route', 'arrived', 'check_in',
    'in_progress', 'qc', 'handover', 'completed', 'cancelled'
  )),

  customer_notes text,
  internal_notes text,

  -- Live tracking fields — same shape as FixNow's tracking_sessions:
  -- present only while status = 'en_route', cleared on arrival.
  tracking_active boolean not null default false,
  current_lat double precision,
  current_lng double precision,
  location_updated_at timestamptz,

  created_at timestamptz not null default now(),
  assigned_at timestamptz,
  en_route_at timestamptz,
  arrived_at timestamptz,
  check_in_at timestamptz,
  in_progress_at timestamptz,
  qc_at timestamptz,
  handover_at timestamptz,
  completed_at timestamptz,
  cancelled_at timestamptz,
  cancellation_reason text,

  constraint bookings_position_consistency check ((current_lat is null) = (current_lng is null)),
  constraint bookings_destination_consistency check ((destination_lat is null) = (destination_lng is null))
);

comment on table public.bookings is
  'One row per mobile detailing booking. Status walks the detailer-travels-'
  'to-customer workflow (see file header) — never a workshop one.';

create index if not exists bookings_customer_id_idx on public.bookings (customer_id);
create index if not exists bookings_status_idx on public.bookings (status);
create index if not exists bookings_scheduled_start_idx on public.bookings (scheduled_start);
create index if not exists bookings_assigned_detailer_id_idx on public.bookings (assigned_detailer_id);

alter table public.bookings enable row level security;

-- Customers: read their own bookings, and create new ones (checkout) — but
-- no direct update/delete. Every status transition after creation happens
-- either through a detailer_* RPC (see detailer_rpcs migration) or through
-- staff (authenticated + is_staff()), never a bare customer UPDATE — a
-- customer cancelling their own upcoming booking goes through
-- cancel_own_booking() below instead, which enforces "only while confirmed".
drop policy if exists "Customers read own bookings" on public.bookings;
create policy "Customers read own bookings"
  on public.bookings for select
  to authenticated
  using (customer_id = auth.uid() or public.is_staff());

drop policy if exists "Customers create own bookings" on public.bookings;
create policy "Customers create own bookings"
  on public.bookings for insert
  to authenticated
  with check (
    customer_id = auth.uid()
    and status = 'confirmed'
    and public.is_postcode_covered(service_postcode)
  );

drop policy if exists "Staff create bookings" on public.bookings;
create policy "Staff create bookings"
  on public.bookings for insert
  to authenticated
  with check (public.is_staff());

drop policy if exists "Staff update bookings" on public.bookings;
create policy "Staff update bookings"
  on public.bookings for update
  to authenticated
  using (public.is_staff())
  with check (public.is_staff());

drop policy if exists "Staff delete bookings" on public.bookings;
create policy "Staff delete bookings"
  on public.bookings for delete
  to authenticated
  using (public.is_staff());

revoke all on public.bookings from anon, public;
grant select, insert on public.bookings to authenticated;
grant update, delete on public.bookings to authenticated;

-- ---------------------------------------------------------------------------
-- Customer self-service cancellation. A bare UPDATE isn't granted to
-- customers (see policy above) specifically so this stays the only path —
-- only while status is still 'confirmed' (once staff has assigned a
-- detailer, cancelling needs a human to also stand the detailer down, so it
-- becomes a staff action, matching FixNow's "cancelling is admin-only").
-- ---------------------------------------------------------------------------
create or replace function public.cancel_own_booking(p_booking_id uuid, p_reason text default 'Customer cancelled')
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.bookings
  set status = 'cancelled',
      cancelled_at = now(),
      cancellation_reason = p_reason
  where id = p_booking_id
    and customer_id = auth.uid()
    and status = 'confirmed';

  if not found then
    raise exception 'Booking not found, not yours, or can no longer be cancelled online — call us instead.';
  end if;
end;
$$;

revoke all on function public.cancel_own_booking(uuid, text) from public;
grant execute on function public.cancel_own_booking(uuid, text) to authenticated;
