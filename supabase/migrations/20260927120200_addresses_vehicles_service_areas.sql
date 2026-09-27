-- True To Detail Job System — addresses, vehicles, and mobile service-area
-- eligibility.
--
-- Because this is a mobile service ("where should we detail the vehicle?"),
-- a saved address is nearly as central a record as the vehicle itself — see
-- customer_addresses below. service_areas / is_postcode_covered() mirrors
-- src/lib/service-area.ts's client-side coverage check as a defense-in-depth
-- server-side gate on booking creation (see bookings migration).

create table if not exists public.customer_addresses (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id) on delete cascade,

  label text not null default 'Home' check (label in ('Home', 'Work', 'Other')),
  line1 text not null,
  line2 text,
  city text,
  postcode text not null,
  lat double precision,
  lng double precision,

  is_default boolean not null default false,
  created_at timestamptz not null default now(),

  constraint customer_addresses_coords_consistency check ((lat is null) = (lng is null))
);

comment on table public.customer_addresses is
  'A customer''s saved service addresses (Home / Work / Other) — selected '
  'during booking as "where should we detail the vehicle?".';

create index if not exists customer_addresses_customer_id_idx on public.customer_addresses (customer_id);

alter table public.customer_addresses enable row level security;

drop policy if exists "Customers manage own addresses" on public.customer_addresses;
create policy "Customers manage own addresses"
  on public.customer_addresses
  for all
  to authenticated
  using (customer_id = auth.uid() or public.is_staff())
  with check (customer_id = auth.uid() or public.is_staff());

revoke all on public.customer_addresses from anon, public;
grant select, insert, update, delete on public.customer_addresses to authenticated;

-- ---------------------------------------------------------------------------
-- Vehicles — "Your Garage". Deliberately no ownership-transfer or VRM-lookup
-- logic for V1: a customer types their own reg/make/model.
-- ---------------------------------------------------------------------------
create table if not exists public.vehicles (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id) on delete cascade,

  make text,
  model text,
  registration text not null,
  colour text,
  photo_url text,
  notes text,

  created_at timestamptz not null default now()
);

comment on table public.vehicles is 'A customer''s saved vehicles ("Your Garage").';

create index if not exists vehicles_customer_id_idx on public.vehicles (customer_id);

alter table public.vehicles enable row level security;

drop policy if exists "Customers manage own vehicles" on public.vehicles;
create policy "Customers manage own vehicles"
  on public.vehicles
  for all
  to authenticated
  using (customer_id = auth.uid() or public.is_staff())
  with check (customer_id = auth.uid() or public.is_staff());

revoke all on public.vehicles from anon, public;
grant select, insert, update, delete on public.vehicles to authenticated;

-- ---------------------------------------------------------------------------
-- Service areas — the postcode "areas" (leading letters, e.g. "HP" from
-- "HP2 6EL") True To Detail's mobile service currently covers. Mirrors
-- src/lib/service-area.ts's COVERED_POSTCODE_AREAS exactly; keep both in
-- sync when the coverage area changes. Public info (shown on the booking
-- flow's postcode gate before the customer is even signed in), writable
-- only by staff.
-- ---------------------------------------------------------------------------
create table if not exists public.service_areas (
  postcode_area text primary key
);

comment on table public.service_areas is
  'Postcode "areas" (outward-code letters) True To Detail''s mobile service '
  'covers. Kept in sync with COVERED_POSTCODE_AREAS in src/lib/service-area.ts.';

insert into public.service_areas (postcode_area) values ('HP'), ('WD'), ('AL'), ('LU')
on conflict do nothing;

alter table public.service_areas enable row level security;

drop policy if exists "Anyone can read service areas" on public.service_areas;
create policy "Anyone can read service areas"
  on public.service_areas for select
  to anon, authenticated
  using (true);

drop policy if exists "Staff manage service areas" on public.service_areas;
create policy "Staff manage service areas"
  on public.service_areas for all
  to authenticated
  using (public.is_staff())
  with check (public.is_staff());

grant select on public.service_areas to anon, authenticated;
grant insert, update, delete on public.service_areas to authenticated;

create or replace function public.is_postcode_covered(p_postcode text)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.service_areas a
    where upper(regexp_replace(p_postcode, '\s+', '', 'g')) like (a.postcode_area || '%')
      -- guards against a false match like area "AL" matching a postcode
      -- that merely starts with those letters for unrelated reasons: real
      -- UK outward codes are 2-4 chars, and the area prefix is always
      -- immediately followed by a digit.
      and upper(regexp_replace(p_postcode, '\s+', '', 'g')) ~ ('^' || a.postcode_area || '[0-9]')
  );
$$;

comment on function public.is_postcode_covered(text) is
  'Server-side mirror of isAreaCovered() in src/lib/service-area.ts. Used as '
  'a defense-in-depth check on booking creation (see bookings migration) — '
  'the real UX gate is the client-side postcode check before the customer '
  'ever gets to the booking form.';

revoke all on function public.is_postcode_covered(text) from public;
grant execute on function public.is_postcode_covered(text) to anon, authenticated;
