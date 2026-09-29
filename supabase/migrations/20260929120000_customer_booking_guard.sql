-- Customers create bookings straight from the browser through the API, and
-- the insert policy only checked the customer, status and postcode. Price,
-- package, add-ons, duration, detailer, notes and tracking all came from
-- the request, so a signed-in customer could book a Premium Detail for £1,
-- in the past, pre-assigned and marked completed.
--
-- This adds the price list on the database side and a BEFORE INSERT trigger
-- that, for anyone who isn't staff, rebuilds every priced or staff-owned
-- field from that list and refuses unknown items or times that have passed.
-- Staff inserts are left untouched so the office can still enter custom
-- prices, back-dated jobs and a detailer up front.
--
-- Keep these rows in step with DETAIL_PACKAGES / DETAIL_ADDONS in
-- src/lib/constants.ts; tests/price-list-sync.test.ts fails if they drift.

create or replace function public.detail_package_list()
returns table (id text, name text, duration_minutes int, small numeric, midsize numeric, largesuv numeric)
language sql
immutable
as $$
  values
    ('essential',      'Essential Car Detail',    150,  80, 90, 105),
    ('full-valet',     'Full Valet Car Detail',   270, 140, 155, 175),
    ('premium-detail', 'Premium Full Car Detail', 390, 220, 240, 270)
$$;

create or replace function public.detail_addon_list()
returns table (id text, label text, price numeric)
language sql
immutable
as $$
  values
    ('engine-bay',   'Engine Bay Clean',            40),
    ('pet-hair',     'Pet Hair Removal',            25),
    ('odour',        'Odour Treatment',             30),
    ('seat-shampoo', 'Seat Shampoo (extra heavy)',  30),
    ('steam',        'Interior Steam Sanitisation', 35)
$$;

grant execute on function public.detail_package_list() to anon, authenticated;
grant execute on function public.detail_addon_list() to anon, authenticated;

create or replace function public.guard_customer_booking()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pkg record;
  v_addons text[];
  v_addon_total numeric;
  v_labels text[];
begin
  if public.is_staff() then
    return new;
  end if;

  select * into v_pkg from public.detail_package_list() p where p.id = new.package_id;
  if not found then
    raise exception 'Unknown package: %', new.package_id using errcode = '22023';
  end if;

  -- Each add-on once, in the order given, and every one must be real.
  select coalesce(array_agg(a order by first_pos), '{}')
  into v_addons
  from (
    select a, min(pos) as first_pos
    from unnest(coalesce(new.addon_ids, '{}')) with ordinality as t(a, pos)
    group by a
  ) d;

  if exists (select 1 from unnest(v_addons) a where a not in (select id from public.detail_addon_list())) then
    raise exception 'Unknown add-on in %', v_addons using errcode = '22023';
  end if;

  select coalesce(sum(l.price), 0), coalesce(array_agg(l.label order by array_position(v_addons, l.id)), '{}')
  into v_addon_total, v_labels
  from public.detail_addon_list() l
  where l.id = any (v_addons);

  -- Same one-hour same-day notice the booking pages enforce.
  if new.scheduled_start < now() + interval '1 hour' then
    raise exception 'That time has already passed. Please pick a later slot.' using errcode = '22023';
  end if;

  new.package_name := v_pkg.name;
  new.estimated_duration_minutes := v_pkg.duration_minutes;
  new.addon_ids := v_addons;
  new.addon_labels := v_labels;
  new.price := case new.vehicle_size
    when 'small' then v_pkg.small
    when 'midsize' then v_pkg.midsize
    when 'largesuv' then v_pkg.largesuv
  end + v_addon_total;

  new.status := 'confirmed';
  new.customer_notes := left(new.customer_notes, 1000);
  new.internal_notes := null;
  new.assigned_detailer_id := null;
  new.travel_time_minutes := null;
  new.tracking_active := false;
  new.current_lat := null;
  new.current_lng := null;
  new.location_updated_at := null;
  new.created_at := now();
  new.assigned_at := null;
  new.en_route_at := null;
  new.arrived_at := null;
  new.check_in_at := null;
  new.in_progress_at := null;
  new.qc_at := null;
  new.handover_at := null;
  new.completed_at := null;
  new.cancelled_at := null;
  new.cancellation_reason := null;
  return new;
end;
$$;

drop trigger if exists guard_customer_booking on public.bookings;
create trigger guard_customer_booking
  before insert on public.bookings
  for each row execute function public.guard_customer_booking();

comment on function public.guard_customer_booking() is
  'Rebuilds price, package details and staff-only fields on customer-created bookings; staff inserts pass through.';

-- Walk-in customer records (created by staff, with an email but no login)
-- were claimed by whoever signed up with a matching email, at the moment
-- the account row was created and before that email was confirmed. That
-- let someone attach another person's bookings, addresses and vehicles to
-- their own login, or lock the real customer out of their history. Now a
-- walk-in record is only claimed once the email is confirmed; until then a
-- new signup gets its own fresh record, merged at confirmation.
create or replace function public.claim_or_create_customer(p_user_id uuid, p_email text, p_meta jsonb, p_confirmed boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_existing_id uuid;
  v_own_id uuid;
begin
  select id into v_own_id from public.customers where auth_user_id = p_user_id;

  if p_confirmed then
    select id into v_existing_id
    from public.customers
    where auth_user_id is null
      and email is not null
      and lower(email) = lower(coalesce(p_email, ''))
    order by created_at
    limit 1;
  end if;

  if v_existing_id is not null then
    -- Move anything the placeholder record picked up before confirmation
    -- onto the walk-in record, then retire the placeholder.
    if v_own_id is not null then
      update public.bookings set customer_id = v_existing_id where customer_id = v_own_id;
      update public.vehicles set customer_id = v_existing_id where customer_id = v_own_id;
      update public.customer_addresses set customer_id = v_existing_id where customer_id = v_own_id;
      delete from public.customers where id = v_own_id;
    end if;
    update public.customers
    set auth_user_id = p_user_id,
        first_name = coalesce(p_meta ->> 'first_name', first_name),
        last_name = coalesce(p_meta ->> 'last_name', last_name),
        phone = coalesce(p_meta ->> 'phone', phone)
    where id = v_existing_id;
  elsif v_own_id is null then
    insert into public.customers (auth_user_id, first_name, last_name, email, phone)
    values (
      p_user_id,
      coalesce(p_meta ->> 'first_name', split_part(coalesce(p_email, ''), '@', 1)),
      p_meta ->> 'last_name',
      p_email,
      p_meta ->> 'phone'
    )
    on conflict (auth_user_id) do nothing;
  end if;
end;
$$;

revoke all on function public.claim_or_create_customer(uuid, text, jsonb, boolean) from public, anon, authenticated;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.claim_or_create_customer(new.id, new.email, new.raw_user_meta_data, new.email_confirmed_at is not null);
  return new;
end;
$$;

create or replace function public.handle_user_confirmed()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.email_confirmed_at is null and new.email_confirmed_at is not null then
    perform public.claim_or_create_customer(new.id, new.email, new.raw_user_meta_data, true);
  end if;
  return new;
end;
$$;

drop trigger if exists on_auth_user_confirmed on auth.users;
create trigger on_auth_user_confirmed
  after update of email_confirmed_at on auth.users
  for each row execute function public.handle_user_confirmed();

-- The check-in photo bucket accepts uploads from anyone with the app open
-- (see booking_stages_and_checkin), so it could otherwise host arbitrary
-- files, HTML pages included, on the project's public storage domain. The
-- app only ever uploads a resized JPEG well under 1MB.
update storage.buckets
set allowed_mime_types = array['image/jpeg'],
    file_size_limit = 5 * 1024 * 1024
where id = 'check-in-photos';

-- Same function as before; only the customer-facing message changes, to
-- drop the em dash and give the number to call.
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
      cancellation_reason = left(coalesce(p_reason, 'Customer cancelled'), 500)
  where id = p_booking_id
    and customer_id = public.my_customer_id()
    and status = 'confirmed';

  if not found then
    raise exception 'This booking can''t be cancelled online any more. Please call or WhatsApp us on 07359 591800.';
  end if;
end;
$$;
