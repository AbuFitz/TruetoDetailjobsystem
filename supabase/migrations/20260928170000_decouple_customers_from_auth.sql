-- Decouple customer identity from requiring a Supabase Auth account, so
-- staff can create a "walk-in" customer (name/phone/email/vehicle/address)
-- directly from the New Booking flow, with no login required. If that
-- person later signs up with a matching email, handle_new_user() links
-- their new auth account onto the SAME customer row instead of creating a
-- duplicate — same history, same rewards progress, no "which one is real"
-- confusion.

-- 1. customers.id becomes its own identity, no longer forced to equal
--    auth.users.id. auth_user_id is the (nullable, unique) link to a real
--    login — null means "walk-in, no account yet".
alter table public.customers
  drop constraint if exists customers_id_fkey;

alter table public.customers
  alter column id set default gen_random_uuid();

alter table public.customers
  add column if not exists auth_user_id uuid unique references auth.users(id) on delete set null;

-- Backfill: every existing customer row today literally *is* an auth user
-- (that was the old model), so point auth_user_id at the same id.
update public.customers set auth_user_id = id where auth_user_id is null;

comment on table public.customers is
  'One row per customer, staff-visible identity whether or not they have '
  'ever signed in. auth_user_id is null for a walk-in customer staff added '
  'directly on a booking; it gets filled in by handle_new_user() the '
  'moment/if that person signs up with a matching email, linking their new '
  'login onto this same row rather than creating a duplicate.';

comment on column public.customers.auth_user_id is
  'Null = walk-in customer with no login yet. Set once they sign up (see '
  'handle_new_user()) or if staff link an existing auth account to them.';

-- 2. public.my_customer_id() — the new equivalent of "auth.uid()" for
--    everywhere that used to compare customer_id = auth.uid() directly.
--    Returns null for staff/no-match, which is fine: every policy below
--    already ORs in public.is_staff() separately.
create or replace function public.my_customer_id()
returns uuid
language sql
security definer
set search_path = public
stable
as $$
  select id from public.customers where auth_user_id = auth.uid();
$$;

comment on function public.my_customer_id() is
  'The customers.id row for the current authenticated user, or null if '
  'they have none (e.g. a staff account, which has no customers row at '
  'all). Replaces the old "customer_id = auth.uid()" pattern now that '
  'customers.id is its own identity rather than literally the auth user id.';

revoke all on function public.my_customer_id() from public;
grant execute on function public.my_customer_id() to authenticated;

-- 3. customers RLS — was "id = auth.uid()", now "auth_user_id = auth.uid()".
--    Staff can now also INSERT a walk-in customer row directly (previously
--    nobody could — rows only ever came from handle_new_user()).
drop policy if exists "Customers read own row" on public.customers;
create policy "Customers read own row"
  on public.customers for select
  to authenticated
  using (auth_user_id = auth.uid() or public.is_staff());

drop policy if exists "Customers update own row" on public.customers;
create policy "Customers update own row"
  on public.customers for update
  to authenticated
  using (auth_user_id = auth.uid() or public.is_staff())
  with check (auth_user_id = auth.uid() or public.is_staff());

drop policy if exists "Staff create customers" on public.customers;
create policy "Staff create customers"
  on public.customers for insert
  to authenticated
  with check (public.is_staff());

grant insert on public.customers to authenticated;

-- 4. customer_addresses / vehicles / bookings RLS — same rewrite, via
--    my_customer_id() instead of a raw auth.uid() comparison.
drop policy if exists "Customers manage own addresses" on public.customer_addresses;
create policy "Customers manage own addresses"
  on public.customer_addresses
  for all
  to authenticated
  using (customer_id = public.my_customer_id() or public.is_staff())
  with check (customer_id = public.my_customer_id() or public.is_staff());

drop policy if exists "Customers manage own vehicles" on public.vehicles;
create policy "Customers manage own vehicles"
  on public.vehicles
  for all
  to authenticated
  using (customer_id = public.my_customer_id() or public.is_staff())
  with check (customer_id = public.my_customer_id() or public.is_staff());

drop policy if exists "Customers read own bookings" on public.bookings;
create policy "Customers read own bookings"
  on public.bookings for select
  to authenticated
  using (customer_id = public.my_customer_id() or public.is_staff());

drop policy if exists "Customers create own bookings" on public.bookings;
create policy "Customers create own bookings"
  on public.bookings for insert
  to authenticated
  with check (
    customer_id = public.my_customer_id()
    and status = 'confirmed'
    and public.is_postcode_covered(service_postcode)
  );

-- 5. cancel_own_booking() — same rewrite.
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
    and customer_id = public.my_customer_id()
    and status = 'confirmed';

  if not found then
    raise exception 'Booking not found, not yours, or can no longer be cancelled online — call us instead.';
  end if;
end;
$$;

-- 6. handle_new_user() — claim an existing walk-in customer row by email
--    match instead of always inserting a fresh one, so booking history /
--    vehicles / addresses / rewards progress carry over the moment someone
--    signs up.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_existing_id uuid;
begin
  select id into v_existing_id
  from public.customers
  where auth_user_id is null
    and email is not null
    and lower(email) = lower(coalesce(new.email, ''))
  limit 1;

  if v_existing_id is not null then
    update public.customers
    set auth_user_id = new.id,
        first_name = coalesce(new.raw_user_meta_data ->> 'first_name', first_name),
        last_name = coalesce(new.raw_user_meta_data ->> 'last_name', last_name),
        phone = coalesce(new.raw_user_meta_data ->> 'phone', phone)
    where id = v_existing_id;
  else
    insert into public.customers (auth_user_id, first_name, last_name, email, phone)
    values (
      new.id,
      coalesce(new.raw_user_meta_data ->> 'first_name', split_part(coalesce(new.email, ''), '@', 1)),
      new.raw_user_meta_data ->> 'last_name',
      new.email,
      new.raw_user_meta_data ->> 'phone'
    )
    on conflict (auth_user_id) do nothing;
  end if;

  return new;
end;
$$;
