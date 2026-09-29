-- Booking workflow: website requests land in the portal, customers get a
-- tracking link, emails are sent once per booking and kind, the detailer's
-- job procedure is shorter, and the customer sees a live ETA.
--
-- Everything here is additive or backward compatible. Existing bookings,
-- routes and detailer links keep working while this is applied.
--
-- 1. Statuses: a website request is `requested` until staff confirm it.
-- 2. Each booking gets a private tracking link token, a source, and the
--    detailer's latest ETA.
-- 3. booking_notifications makes every email idempotent.
-- 4. submit_website_booking(): the website's booking form stores its
--    request here (validated and priced in the database).
-- 5. get_tracked_booking(): the public tracking page reads one booking by
--    its token, and nothing else.
-- 6. claim_booking_email(): the only door to "send an email about this
--    booking", checked against who is asking.
-- 7. Shorter detailer procedure: arrived + check-in, a four item checklist,
--    then finish. No separate check-in, QC or handover steps.

-- ---------------------------------------------------------------------------
-- 1 and 2. Status list and new columns
-- ---------------------------------------------------------------------------
do $$
declare c record;
begin
  for c in
    select conname from pg_constraint
    where conrelid = 'public.bookings'::regclass and contype = 'c'
      and pg_get_constraintdef(oid) like '%handover%'
  loop
    execute format('alter table public.bookings drop constraint %I', c.conname);
  end loop;
end $$;

alter table public.bookings add constraint bookings_status_check check (status in (
  'requested', 'confirmed', 'assigned', 'en_route', 'arrived', 'check_in',
  'in_progress', 'qc', 'handover', 'completed', 'cancelled'
));

alter table public.bookings
  add column if not exists tracking_token text,
  add column if not exists source text not null default 'portal',
  add column if not exists eta_seconds int,
  add column if not exists eta_updated_at timestamptz;

alter table public.bookings drop constraint if exists bookings_source_check;
alter table public.bookings add constraint bookings_source_check check (source in ('portal', 'staff', 'website'));
alter table public.bookings drop constraint if exists bookings_eta_check;
alter table public.bookings add constraint bookings_eta_check check (eta_seconds is null or eta_seconds >= 0);

update public.bookings set tracking_token = public.generate_link_token() where tracking_token is null;
alter table public.bookings
  alter column tracking_token set default public.generate_link_token(),
  alter column tracking_token set not null;
create unique index if not exists bookings_tracking_token_key on public.bookings (tracking_token);

comment on column public.bookings.tracking_token is
  'Private link token for the public tracking page /t/<token>. Treat like a password for this one booking.';
comment on column public.bookings.eta_seconds is
  'Driving time to the address in seconds, sent by the detailer''s phone with each location update. Null when not en route.';

-- Detailer job stages: the shorter checklist adds two keys; old ones stay valid.
do $$
declare c record;
begin
  for c in
    select conname from pg_constraint
    where conrelid = 'public.booking_stage_progress'::regclass and contype = 'c'
      and pg_get_constraintdef(oid) like '%final_qc%'
  loop
    execute format('alter table public.booking_stage_progress drop constraint %I', c.conname);
  end loop;
end $$;

alter table public.booking_stage_progress add constraint booking_stage_progress_stage_key_check check (stage_key in (
  'initial_inspection', 'wheels_prewash', 'exterior_wash', 'interior', 'protection', 'final_qc',
  'exterior', 'final_check'
));

-- ---------------------------------------------------------------------------
-- The customer booking guard, now also protecting the new columns.
-- Inserts from inside submit_website_booking() are trusted (it does its own
-- validation) and flagged with a transaction-local setting.
-- ---------------------------------------------------------------------------
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
  if coalesce(current_setting('ttd.trusted_insert', true), '') = '1' then
    return new;
  end if;
  -- Staff, and trusted server-side connections with no signed-in user
  -- (SQL editor, service role), keep full control.
  if auth.uid() is null or public.is_staff() then
    return new;
  end if;

  select * into v_pkg from public.detail_package_list() p where p.id = new.package_id;
  if not found then
    raise exception 'Unknown package: %', new.package_id using errcode = '22023';
  end if;

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
  new.source := 'portal';
  new.tracking_token := public.generate_link_token();
  new.eta_seconds := null;
  new.eta_updated_at := null;
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

revoke execute on function public.guard_customer_booking() from public, anon, authenticated;

-- Staff-created bookings are marked as such (a trigger, so the app can't forget).
create or replace function public.mark_staff_booking_source()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(current_setting('ttd.trusted_insert', true), '') <> '1'
     and auth.uid() is not null and public.is_staff() and new.source = 'portal' then
    new.source := 'staff';
  end if;
  return new;
end;
$$;
revoke execute on function public.mark_staff_booking_source() from public, anon, authenticated;

drop trigger if exists mark_staff_booking_source on public.bookings;
create trigger mark_staff_booking_source
  before insert on public.bookings
  for each row execute function public.mark_staff_booking_source();

-- Customers may cancel a request as well as a confirmed booking.
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
    and status in ('requested', 'confirmed');

  if not found then
    raise exception 'This booking can''t be cancelled online any more. Please call or WhatsApp us on 07359 591800.';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Email log (one row per booking and kind)
-- ---------------------------------------------------------------------------
create table if not exists public.booking_notifications (
  booking_id uuid not null references public.bookings(id) on delete cascade,
  kind text not null check (kind in ('booked_in', 'assigned', 'on_the_way', 'completed', 'cancelled')),
  sent_at timestamptz not null default now(),
  primary key (booking_id, kind)
);

alter table public.booking_notifications enable row level security;

drop policy if exists "Staff read notification log" on public.booking_notifications;
create policy "Staff read notification log"
  on public.booking_notifications for select
  to authenticated
  using (public.is_staff());

grant select on public.booking_notifications to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Website booking intake
-- ---------------------------------------------------------------------------
create or replace function public.submit_website_booking(
  p_pack text,
  p_vehicle text,
  p_date date,
  p_time text,
  p_name text,
  p_phone text,
  p_email text,
  p_postcode text,
  p_car_reg text,
  p_addons text[] default '{}',
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pkg record;
  v_email text := lower(trim(coalesce(p_email, '')));
  v_postcode text := upper(regexp_replace(trim(coalesce(p_postcode, '')), '\s+', ' ', 'g'));
  v_reg text := upper(regexp_replace(coalesce(p_car_reg, ''), '\s+', '', 'g'));
  v_name text := left(trim(coalesce(p_name, '')), 100);
  v_addons text[];
  v_addon_total numeric;
  v_labels text[];
  v_slot time;
  v_start timestamptz;
  v_customer uuid;
  v_price numeric;
  v_booking public.bookings;
begin
  if v_email !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' or length(v_email) > 200 then
    raise exception 'Invalid email address' using errcode = '22023';
  end if;
  if coalesce(p_phone, '') !~ '^[0-9 +()\-]{7,20}$' then
    raise exception 'Invalid phone number' using errcode = '22023';
  end if;
  if v_postcode !~ '^[A-Z]{1,2}[0-9][0-9A-Z]? ?[0-9][A-Z]{2}$' then
    raise exception 'Please enter a valid UK postcode' using errcode = '22023';
  end if;
  if not public.is_postcode_covered(v_postcode) then
    raise exception 'That postcode is outside our service area' using errcode = '22023';
  end if;
  if v_reg !~ '^[A-Z0-9]{2,8}$' then
    raise exception 'Invalid vehicle registration' using errcode = '22023';
  end if;
  if p_vehicle not in ('small', 'midsize', 'largesuv') then
    raise exception 'Invalid vehicle type' using errcode = '22023';
  end if;
  if length(coalesce(p_notes, '')) > 1000 then
    raise exception 'Notes too long' using errcode = '22023';
  end if;

  select * into v_pkg from public.detail_package_list() p
  where p.id = lower(replace(trim(coalesce(p_pack, '')), ' ', '-'));
  if not found then
    raise exception 'Invalid pack selection' using errcode = '22023';
  end if;

  select coalesce(array_agg(a order by first_pos), '{}')
  into v_addons
  from (
    select a, min(pos) as first_pos
    from unnest(coalesce(p_addons, '{}')) with ordinality as t(a, pos)
    group by a
  ) d;
  if exists (select 1 from unnest(v_addons) a where a not in (select id from public.detail_addon_list())) then
    raise exception 'Invalid add-on selection' using errcode = '22023';
  end if;
  select coalesce(sum(l.price), 0), coalesce(array_agg(l.label order by array_position(v_addons, l.id)), '{}')
  into v_addon_total, v_labels
  from public.detail_addon_list() l
  where l.id = any (v_addons);

  if p_time not in ('8:00 AM', '10:00 AM', '12:00 PM', '2:00 PM', '4:00 PM', '6:00 PM') then
    raise exception 'Invalid time slot' using errcode = '22023';
  end if;
  v_slot := to_timestamp(p_time, 'HH12:MI AM')::time;
  v_start := (p_date + v_slot) at time zone 'Europe/London';
  if v_start < now() + interval '1 hour' then
    raise exception 'That time has already passed. Please pick a later slot or another day.' using errcode = '22023';
  end if;
  if v_start > now() + interval '1 year' then
    raise exception 'Please pick a date within the next year' using errcode = '22023';
  end if;

  -- Flood limits: a few requests per email per day, and a ceiling overall.
  if (
    select count(*) from public.bookings b join public.customers c on c.id = b.customer_id
    where lower(c.email) = v_email and b.source = 'website' and b.created_at > now() - interval '24 hours'
  ) >= 5 then
    raise exception 'Too many requests for this email today. Please call us on 07359 591800.' using errcode = '54000';
  end if;
  if (select count(*) from public.bookings where source = 'website' and created_at > now() - interval '1 hour') >= 60 then
    raise exception 'We are receiving a lot of requests right now. Please call us on 07359 591800.' using errcode = '54000';
  end if;

  select id into v_customer from public.customers
  where lower(email) = v_email
  order by (auth_user_id is not null) desc, created_at
  limit 1;

  if v_customer is null then
    insert into public.customers (first_name, last_name, email, phone)
    values (
      coalesce(nullif(split_part(v_name, ' ', 1), ''), split_part(v_email, '@', 1)),
      nullif(trim(substr(v_name, length(split_part(v_name, ' ', 1)) + 1)), ''),
      v_email,
      trim(p_phone)
    )
    returning id into v_customer;
  end if;

  v_price := case p_vehicle when 'small' then v_pkg.small when 'midsize' then v_pkg.midsize else v_pkg.largesuv end + v_addon_total;

  perform set_config('ttd.trusted_insert', '1', true);
  insert into public.bookings (
    customer_id, service_address_line1, service_postcode, vehicle_registration,
    package_id, package_name, vehicle_size, addon_ids, addon_labels, price,
    scheduled_start, estimated_duration_minutes, customer_notes, status, source
  )
  values (
    v_customer, 'Address to be confirmed', v_postcode, v_reg,
    v_pkg.id, v_pkg.name, p_vehicle, v_addons, v_labels, v_price,
    v_start, v_pkg.duration_minutes, nullif(trim(coalesce(p_notes, '')), ''), 'requested', 'website'
  )
  returning * into v_booking;
  perform set_config('ttd.trusted_insert', '', true);

  return jsonb_build_object(
    'id', v_booking.id,
    'reference', v_booking.booking_reference,
    'tracking_token', v_booking.tracking_token,
    'price', v_booking.price,
    'package_name', v_booking.package_name,
    'scheduled_start', v_booking.scheduled_start
  );
end;
$$;

revoke all on function public.submit_website_booking(text, text, date, text, text, text, text, text, text, text[], text) from public;
grant execute on function public.submit_website_booking(text, text, date, text, text, text, text, text, text, text[], text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 5. Public tracking page data
-- ---------------------------------------------------------------------------
create or replace function public.get_tracked_booking(p_token text)
returns jsonb
language sql
security definer
set search_path = public
stable
as $$
  select jsonb_build_object(
    'reference', b.booking_reference,
    'status', b.status,
    'source', b.source,
    'package_name', b.package_name,
    'addon_labels', b.addon_labels,
    'price', b.price,
    'vehicle_description', b.vehicle_description,
    'vehicle_registration', b.vehicle_registration,
    'scheduled_start', b.scheduled_start,
    'estimated_duration_minutes', b.estimated_duration_minutes,
    'service_city', b.service_address_city,
    'service_postcode', b.service_postcode,
    'customer_first_name', c.first_name,
    'customer_has_account', c.auth_user_id is not null,
    'created_at', b.created_at,
    'en_route_at', b.en_route_at,
    'arrived_at', b.arrived_at,
    'in_progress_at', b.in_progress_at,
    'completed_at', b.completed_at,
    'cancelled_at', b.cancelled_at,
    'detailer', case when d.id is null then null else jsonb_build_object(
      'first_name', split_part(d.name, ' ', 1),
      'job_title', d.job_title,
      'photo_url', d.photo_url,
      'vehicle_description', d.vehicle_description
    ) end,
    'tracking', case when b.tracking_active then jsonb_build_object(
      'lat', b.current_lat,
      'lng', b.current_lng,
      'updated_at', b.location_updated_at,
      'destination_lat', b.destination_lat,
      'destination_lng', b.destination_lng,
      'eta_seconds', b.eta_seconds,
      'eta_updated_at', b.eta_updated_at
    ) else null end,
    'stages', coalesce((
      select jsonb_agg(jsonb_build_object('key', sp.stage_key, 'done', sp.completed_at is not null) order by sp.stage_key)
      from public.booking_stage_progress sp where sp.booking_id = b.id
    ), '[]'::jsonb)
  )
  from public.bookings b
  join public.customers c on c.id = b.customer_id
  left join public.detailers d on d.id = b.assigned_detailer_id
  where length(coalesce(p_token, '')) between 8 and 64
    and b.tracking_token = p_token
  limit 1;
$$;

revoke all on function public.get_tracked_booking(text) from public;
grant execute on function public.get_tracked_booking(text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 6. Email claims
-- ---------------------------------------------------------------------------
create or replace function public._booking_email_allowed(p_booking_id uuid, p_kind text, p_token text)
returns boolean
language plpgsql
security definer
set search_path = public
stable
as $$
declare b public.bookings;
begin
  select * into b from public.bookings where id = p_booking_id;
  if not found then return false; end if;

  if public.is_staff() then return true; end if;

  -- A customer can trigger the "you are booked in" email for a booking they
  -- have just made themselves in the portal.
  if p_kind = 'booked_in' and b.source = 'portal'
     and b.customer_id = public.my_customer_id()
     and b.created_at > now() - interval '15 minutes' then
    return true;
  end if;

  -- The detailer on the job can trigger the two day-of emails.
  if p_token is not null and p_kind in ('on_the_way', 'completed')
     and b.assigned_detailer_id is not null
     and b.assigned_detailer_id = public.resolve_detailer_id(p_token) then
    return true;
  end if;

  return false;
end;
$$;
revoke all on function public._booking_email_allowed(uuid, text, text) from public, anon, authenticated;

create or replace function public._booking_email_ready(b public.bookings, p_kind text)
returns boolean
language sql
immutable
as $$
  select case p_kind
    when 'booked_in' then b.status not in ('requested', 'cancelled')
    when 'assigned' then b.assigned_detailer_id is not null and b.status not in ('requested', 'cancelled', 'completed')
    when 'on_the_way' then b.status = 'en_route'
    when 'completed' then b.status = 'completed'
    when 'cancelled' then b.status = 'cancelled'
    else false
  end;
$$;
revoke all on function public._booking_email_ready(public.bookings, text) from public, anon, authenticated;

create or replace function public.claim_booking_email(
  p_booking_id uuid,
  p_kind text,
  p_detailer_token text default null,
  p_force boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  b public.bookings;
  v_rows int;
begin
  if p_kind not in ('booked_in', 'assigned', 'on_the_way', 'completed', 'cancelled') then
    raise exception 'Unknown email type' using errcode = '22023';
  end if;
  if not public._booking_email_allowed(p_booking_id, p_kind, p_detailer_token) then
    raise exception 'Not allowed' using errcode = '42501';
  end if;

  select * into b from public.bookings where id = p_booking_id;
  if not public._booking_email_ready(b, p_kind) then
    return null;
  end if;

  if p_force and public.is_staff() then
    delete from public.booking_notifications where booking_id = p_booking_id and kind = p_kind;
  end if;

  insert into public.booking_notifications (booking_id, kind) values (p_booking_id, p_kind)
  on conflict do nothing;
  get diagnostics v_rows = row_count;
  if v_rows = 0 then
    return null;
  end if;

  return (
    select jsonb_build_object(
      'kind', p_kind,
      'reference', b.booking_reference,
      'status', b.status,
      'source', b.source,
      'customer_email', c.email,
      'customer_first_name', c.first_name,
      'customer_has_account', c.auth_user_id is not null,
      'package_name', b.package_name,
      'addon_labels', b.addon_labels,
      'price', b.price,
      'vehicle_description', b.vehicle_description,
      'vehicle_registration', b.vehicle_registration,
      'scheduled_start', b.scheduled_start,
      'estimated_duration_minutes', b.estimated_duration_minutes,
      'address_line1', b.service_address_line1,
      'address_city', b.service_address_city,
      'postcode', b.service_postcode,
      'cancellation_reason', b.cancellation_reason,
      'tracking_token', b.tracking_token,
      'detailer_first_name', case when d.id is null then null else split_part(d.name, ' ', 1) end,
      'detailer_job_title', d.job_title,
      'detailer_vehicle', d.vehicle_description
    )
    from public.customers c
    left join public.detailers d on d.id = b.assigned_detailer_id
    where c.id = b.customer_id
  );
end;
$$;

revoke all on function public.claim_booking_email(uuid, text, text, boolean) from public;
grant execute on function public.claim_booking_email(uuid, text, text, boolean) to anon, authenticated;

-- If sending fails, the claim is handed back so a retry can go through.
create or replace function public.release_booking_email(
  p_booking_id uuid,
  p_kind text,
  p_detailer_token text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public._booking_email_allowed(p_booking_id, p_kind, p_detailer_token) then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  delete from public.booking_notifications
  where booking_id = p_booking_id and kind = p_kind and sent_at > now() - interval '5 minutes';
end;
$$;

revoke all on function public.release_booking_email(uuid, text, text) from public;
grant execute on function public.release_booking_email(uuid, text, text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 7. Shorter detailer procedure
-- ---------------------------------------------------------------------------

-- Location updates now carry the detailer's ETA. Same name and first four
-- arguments as before, so an older cached page still works.
drop function if exists public.detailer_update_location(text, uuid, double precision, double precision);
create or replace function public.detailer_update_location(
  p_token text,
  p_booking_id uuid,
  p_lat double precision,
  p_lng double precision,
  p_eta_seconds int default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_detailer_id uuid := public.resolve_detailer_id(p_token);
begin
  if v_detailer_id is null then
    raise exception 'Invalid or inactive detailer link';
  end if;

  update public.bookings
  set current_lat = p_lat,
      current_lng = p_lng,
      location_updated_at = now(),
      eta_seconds = case when p_eta_seconds is null then eta_seconds else greatest(p_eta_seconds, 0) end,
      eta_updated_at = case when p_eta_seconds is null then eta_updated_at else now() end
  where id = p_booking_id and assigned_detailer_id = v_detailer_id and status = 'en_route';

  if not found then
    raise exception 'Job not found, not assigned to you, or not en route';
  end if;
end;
$$;
revoke all on function public.detailer_update_location(text, uuid, double precision, double precision, int) from public;
grant execute on function public.detailer_update_location(text, uuid, double precision, double precision, int) to anon, authenticated;

-- Arriving clears the ETA along with the live location.
create or replace function public.detailer_mark_arrived(p_token text, p_booking_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_detailer_id uuid := public.resolve_detailer_id(p_token);
begin
  if v_detailer_id is null then
    raise exception 'Invalid or inactive detailer link';
  end if;

  update public.bookings
  set status = 'arrived',
      tracking_active = false,
      arrived_at = now(),
      current_lat = null,
      current_lng = null,
      location_updated_at = null,
      eta_seconds = null,
      eta_updated_at = null
  where id = p_booking_id and assigned_detailer_id = v_detailer_id and status = 'en_route';

  if not found then
    raise exception 'Job not found, not assigned to you, or not en route';
  end if;
end;
$$;

-- Check-in is submitted straight from "arrived" (the separate "start
-- check-in" step is gone), and seeds the four item checklist.
create or replace function public.detailer_submit_check_in(
  p_token text,
  p_booking_id uuid,
  p_mileage int,
  p_exterior_damage_notes text,
  p_wheel_damage_notes text,
  p_interior_condition_notes text,
  p_valuables_notes text,
  p_customer_requests text,
  p_access_notes text,
  p_water_available boolean,
  p_electric_available boolean,
  p_vehicle_position_notes text,
  p_blocking_issue text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_detailer_id uuid := public.resolve_detailer_id(p_token);
begin
  if v_detailer_id is null then
    raise exception 'Invalid or inactive detailer link';
  end if;

  update public.bookings
  set status = 'in_progress', check_in_at = coalesce(check_in_at, now()), in_progress_at = now()
  where id = p_booking_id and assigned_detailer_id = v_detailer_id and status in ('arrived', 'check_in');

  if not found then
    raise exception 'Job not found, not assigned to you, or you have not arrived yet';
  end if;

  insert into public.check_ins (
    booking_id, mileage, exterior_damage_notes, wheel_damage_notes,
    interior_condition_notes, valuables_notes, customer_requests, access_notes,
    water_available, electric_available, vehicle_position_notes, blocking_issue
  )
  values (
    p_booking_id, p_mileage, p_exterior_damage_notes, p_wheel_damage_notes,
    p_interior_condition_notes, p_valuables_notes, p_customer_requests, p_access_notes,
    p_water_available, p_electric_available, p_vehicle_position_notes, p_blocking_issue
  )
  on conflict (booking_id) do update set
    mileage = excluded.mileage,
    exterior_damage_notes = excluded.exterior_damage_notes,
    wheel_damage_notes = excluded.wheel_damage_notes,
    interior_condition_notes = excluded.interior_condition_notes,
    valuables_notes = excluded.valuables_notes,
    customer_requests = excluded.customer_requests,
    access_notes = excluded.access_notes,
    water_available = excluded.water_available,
    electric_available = excluded.electric_available,
    vehicle_position_notes = excluded.vehicle_position_notes,
    blocking_issue = excluded.blocking_issue;

  insert into public.booking_stage_progress (booking_id, stage_key)
  select p_booking_id, k from unnest(array['exterior', 'interior', 'protection', 'final_check']) as k
  on conflict (booking_id, stage_key) do nothing;
end;
$$;

-- Ticking a stage no longer moves the booking's status.
create or replace function public.detailer_toggle_stage(
  p_token text, p_booking_id uuid, p_stage_key text, p_completed boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_detailer_id uuid := public.resolve_detailer_id(p_token);
begin
  if v_detailer_id is null then
    raise exception 'Invalid or inactive detailer link';
  end if;

  update public.booking_stage_progress sp
  set completed_at = case when p_completed then now() else null end
  from public.bookings b
  where sp.booking_id = b.id
    and sp.booking_id = p_booking_id
    and sp.stage_key = p_stage_key
    and b.assigned_detailer_id = v_detailer_id
    and b.status in ('in_progress', 'qc');

  if not found then
    raise exception 'Job not found, not assigned to you, not in progress, or unknown stage';
  end if;
end;
$$;

-- Finish: every stage must be ticked; records who the car was handed back
-- to (optional) and completes the job in one step.
create or replace function public.detailer_finish_job(
  p_token text, p_booking_id uuid, p_customer_name text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_detailer_id uuid := public.resolve_detailer_id(p_token);
begin
  if v_detailer_id is null then
    raise exception 'Invalid or inactive detailer link';
  end if;

  if not exists (
    select 1 from public.bookings
    where id = p_booking_id and assigned_detailer_id = v_detailer_id
      and status in ('in_progress', 'qc', 'handover')
  ) then
    raise exception 'Job not found, not assigned to you, or not in progress';
  end if;

  if exists (
    select 1 from public.booking_stage_progress
    where booking_id = p_booking_id and completed_at is null
  ) then
    raise exception 'Tick off every stage before finishing the job';
  end if;

  if nullif(trim(coalesce(p_customer_name, '')), '') is not null then
    update public.check_ins
    set customer_ack_at = now(), customer_ack_name = left(trim(p_customer_name), 100)
    where booking_id = p_booking_id;
  end if;

  update public.bookings
  set status = 'completed', completed_at = now(), qc_at = coalesce(qc_at, now()), handover_at = coalesce(handover_at, now())
  where id = p_booking_id;
end;
$$;
revoke all on function public.detailer_finish_job(text, uuid, text) from public;
grant execute on function public.detailer_finish_job(text, uuid, text) to anon, authenticated;

-- Legacy rows that sit in QC or handover can still be completed.
create or replace function public.detailer_complete_booking(p_token text, p_booking_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_detailer_id uuid := public.resolve_detailer_id(p_token);
begin
  if v_detailer_id is null then
    raise exception 'Invalid or inactive detailer link';
  end if;

  update public.bookings
  set status = 'completed', completed_at = now()
  where id = p_booking_id and assigned_detailer_id = v_detailer_id and status in ('handover', 'qc', 'in_progress');

  if not found then
    raise exception 'Job not found, not assigned to you, or not ready to complete';
  end if;
end;
$$;
