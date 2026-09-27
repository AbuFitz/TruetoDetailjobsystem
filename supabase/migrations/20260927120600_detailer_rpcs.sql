-- True To Detail Job System — the detailer's own mobile job workflow.
--
-- Same shape as FixNow Mechanics Tracking's engineer_* RPCs: no login, just
-- a persistent link_token, resolved server-side on every call. Each mutation
-- re-checks the token AND that the booking is assigned to that detailer AND
-- that the booking is in the expected status before writing — anything else
-- raises rather than silently no-op'ing, same discipline as
-- engineer_start_journey et al.
--
-- Covers the full brief: START JOURNEY -> I'VE ARRIVED -> START CHECK-IN
-- (mileage / damage / valuables / access / water-electric / vehicle
-- position / blocking issues / customer requests / photos / customer
-- acknowledgement) -> the detail-stage checklist -> final QC -> handover ->
-- completed. Cancelling a booking is deliberately NOT exposed here — staff-
-- only, same as FixNow.

create or replace function public.resolve_detailer_id(p_token text)
returns uuid
language sql
security definer
set search_path = public
stable
as $$
  select id from public.detailers where link_token = p_token and active limit 1;
$$;

revoke all on function public.resolve_detailer_id(text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
create or replace function public.get_detailer_profile(p_token text)
returns table (name text, phone text, job_title text, photo_url text, vehicle_description text)
language sql
security definer
set search_path = public
stable
as $$
  select d.name, d.phone, d.job_title, d.photo_url, d.vehicle_description
  from public.detailers d
  where d.id = public.resolve_detailer_id(p_token);
$$;

revoke all on function public.get_detailer_profile(text) from public;
grant execute on function public.get_detailer_profile(text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- The detailer's queue — every not-yet-finished job assigned to them, plus
-- just enough of the customer/address/vehicle to run the job without ever
-- exposing the raw customer_id or full customer record.
-- ---------------------------------------------------------------------------
create or replace function public.get_detailer_jobs(p_token text)
returns table (
  id uuid,
  booking_reference text,
  customer_first_name text,
  customer_phone text,
  vehicle_registration text,
  vehicle_description text,
  service_address_line1 text,
  service_address_line2 text,
  service_address_city text,
  service_postcode text,
  destination_lat double precision,
  destination_lng double precision,
  scheduled_start timestamptz,
  estimated_duration_minutes int,
  package_name text,
  status text,
  customer_notes text,
  internal_notes text,
  tracking_active boolean,
  current_lat double precision,
  current_lng double precision,
  location_updated_at timestamptz
)
language sql
security definer
set search_path = public
stable
as $$
  select
    b.id,
    b.booking_reference,
    c.first_name as customer_first_name,
    c.phone as customer_phone,
    b.vehicle_registration,
    b.vehicle_description,
    b.service_address_line1,
    b.service_address_line2,
    b.service_address_city,
    b.service_postcode,
    b.destination_lat,
    b.destination_lng,
    b.scheduled_start,
    b.estimated_duration_minutes,
    b.package_name,
    b.status,
    b.customer_notes,
    b.internal_notes,
    b.tracking_active,
    b.current_lat,
    b.current_lng,
    b.location_updated_at
  from public.bookings b
  join public.customers c on c.id = b.customer_id
  where b.assigned_detailer_id = public.resolve_detailer_id(p_token)
    and b.status in ('assigned', 'en_route', 'arrived', 'check_in', 'in_progress', 'qc', 'handover')
  order by b.scheduled_start asc;
$$;

revoke all on function public.get_detailer_jobs(text) from public;
grant execute on function public.get_detailer_jobs(text) to anon, authenticated;

create or replace function public.get_detailer_job_history(p_token text)
returns table (
  id uuid,
  booking_reference text,
  vehicle_registration text,
  vehicle_description text,
  scheduled_start timestamptz,
  status text,
  cancellation_reason text
)
language sql
security definer
set search_path = public
stable
as $$
  select b.id, b.booking_reference, b.vehicle_registration, b.vehicle_description,
         b.scheduled_start, b.status, b.cancellation_reason
  from public.bookings b
  where b.assigned_detailer_id = public.resolve_detailer_id(p_token)
    and b.status in ('completed', 'cancelled')
  order by b.scheduled_start desc
  limit 100;
$$;

revoke all on function public.get_detailer_job_history(text) from public;
grant execute on function public.get_detailer_job_history(text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- The detail-stage checklist for one job — booking_stage_progress carries no
-- customer-identifying data, but it's still gated the same way everything
-- else here is: only the assigned detailer's own token can read/write it.
-- ---------------------------------------------------------------------------
create or replace function public.get_detailer_job_stages(p_token text, p_booking_id uuid)
returns table (stage_key text, completed_at timestamptz)
language sql
security definer
set search_path = public
stable
as $$
  select sp.stage_key, sp.completed_at
  from public.booking_stage_progress sp
  join public.bookings b on b.id = sp.booking_id
  where sp.booking_id = p_booking_id
    and b.assigned_detailer_id = public.resolve_detailer_id(p_token)
  order by array_position(
    array['initial_inspection','wheels_prewash','exterior_wash','interior','protection','final_qc'],
    sp.stage_key
  );
$$;

revoke all on function public.get_detailer_job_stages(text, uuid) from public;
grant execute on function public.get_detailer_job_stages(text, uuid) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Journey / arrival — mirrors engineer_start_journey / engineer_update_
-- location / engineer_mark_arrived exactly, just against bookings.
-- ---------------------------------------------------------------------------
create or replace function public.detailer_start_journey(
  p_token text, p_booking_id uuid, p_lat double precision, p_lng double precision
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
  set status = 'en_route',
      tracking_active = true,
      en_route_at = now(),
      current_lat = p_lat,
      current_lng = p_lng,
      location_updated_at = now()
  where id = p_booking_id
    and assigned_detailer_id = v_detailer_id
    and status in ('confirmed', 'assigned');

  if not found then
    raise exception 'Job not found, not assigned to you, or not startable';
  end if;
end;
$$;

create or replace function public.detailer_update_location(
  p_token text, p_booking_id uuid, p_lat double precision, p_lng double precision
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
  set current_lat = p_lat, current_lng = p_lng, location_updated_at = now()
  where id = p_booking_id and assigned_detailer_id = v_detailer_id and status = 'en_route';

  if not found then
    raise exception 'Job not found, not assigned to you, or not en route';
  end if;
end;
$$;

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
      location_updated_at = null
  where id = p_booking_id and assigned_detailer_id = v_detailer_id and status = 'en_route';

  if not found then
    raise exception 'Job not found, not assigned to you, or not en route';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Check-in. START CHECK-IN just flips the status so the UI can switch into
-- the check-in form; the form's actual submit is detailer_submit_check_in,
-- which also seeds the six-item detail-stage checklist (all unchecked) and
-- advances status to IN_PROGRESS in the same transaction.
-- ---------------------------------------------------------------------------
create or replace function public.detailer_start_check_in(p_token text, p_booking_id uuid)
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
  set status = 'check_in', check_in_at = now()
  where id = p_booking_id and assigned_detailer_id = v_detailer_id and status = 'arrived';

  if not found then
    raise exception 'Job not found, not assigned to you, or not arrived yet';
  end if;
end;
$$;

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
  set status = 'in_progress', in_progress_at = now()
  where id = p_booking_id and assigned_detailer_id = v_detailer_id and status = 'check_in';

  if not found then
    raise exception 'Job not found, not assigned to you, or not checked in yet';
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
  select p_booking_id, k
  from unnest(array[
    'initial_inspection','wheels_prewash','exterior_wash','interior','protection','final_qc'
  ]) as k
  on conflict (booking_id, stage_key) do nothing;
end;
$$;

create or replace function public.detailer_add_check_in_photo(
  p_token text, p_booking_id uuid, p_url text, p_caption text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_detailer_id uuid := public.resolve_detailer_id(p_token);
  v_check_in_id uuid;
begin
  if v_detailer_id is null then
    raise exception 'Invalid or inactive detailer link';
  end if;

  select ci.id into v_check_in_id
  from public.check_ins ci
  join public.bookings b on b.id = ci.booking_id
  where ci.booking_id = p_booking_id and b.assigned_detailer_id = v_detailer_id;

  if v_check_in_id is null then
    raise exception 'No check-in found for this job yet';
  end if;

  insert into public.check_in_photos (check_in_id, url, caption) values (v_check_in_id, p_url, p_caption);
end;
$$;

create or replace function public.detailer_customer_ack(
  p_token text, p_booking_id uuid, p_customer_name text
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

  update public.check_ins ci
  set customer_ack_at = now(), customer_ack_name = p_customer_name
  from public.bookings b
  where ci.booking_id = b.id and ci.booking_id = p_booking_id and b.assigned_detailer_id = v_detailer_id;

  if not found then
    raise exception 'No check-in found for this job yet';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Detail-stage checklist toggle. Ticking the final "final_qc" box is what
-- actually advances the booking from IN_PROGRESS to QC — the checklist and
-- the booking status stay in lockstep rather than needing a separate
-- "start QC" button.
-- ---------------------------------------------------------------------------
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
    and b.status = 'in_progress';

  if not found then
    raise exception 'Job not found, not assigned to you, not in progress, or unknown stage';
  end if;

  if p_stage_key = 'final_qc' and p_completed then
    update public.bookings
    set status = 'qc', qc_at = now()
    where id = p_booking_id and assigned_detailer_id = v_detailer_id and status = 'in_progress';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Handover and completion.
-- ---------------------------------------------------------------------------
create or replace function public.detailer_start_handover(p_token text, p_booking_id uuid)
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
  set status = 'handover', handover_at = now()
  where id = p_booking_id and assigned_detailer_id = v_detailer_id and status = 'qc';

  if not found then
    raise exception 'Job not found, not assigned to you, or not in QC yet';
  end if;
end;
$$;

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
  where id = p_booking_id and assigned_detailer_id = v_detailer_id and status = 'handover';

  if not found then
    raise exception 'Job not found, not assigned to you, or not at handover yet';
  end if;
end;
$$;

revoke all on function public.detailer_start_journey(text, uuid, double precision, double precision) from public;
revoke all on function public.detailer_update_location(text, uuid, double precision, double precision) from public;
revoke all on function public.detailer_mark_arrived(text, uuid) from public;
revoke all on function public.detailer_start_check_in(text, uuid) from public;
revoke all on function public.detailer_submit_check_in(text, uuid, int, text, text, text, text, text, text, boolean, boolean, text, text) from public;
revoke all on function public.detailer_add_check_in_photo(text, uuid, text, text) from public;
revoke all on function public.detailer_customer_ack(text, uuid, text) from public;
revoke all on function public.detailer_toggle_stage(text, uuid, text, boolean) from public;
revoke all on function public.detailer_start_handover(text, uuid) from public;
revoke all on function public.detailer_complete_booking(text, uuid) from public;

grant execute on function public.detailer_start_journey(text, uuid, double precision, double precision) to anon, authenticated;
grant execute on function public.detailer_update_location(text, uuid, double precision, double precision) to anon, authenticated;
grant execute on function public.detailer_mark_arrived(text, uuid) to anon, authenticated;
grant execute on function public.detailer_start_check_in(text, uuid) to anon, authenticated;
grant execute on function public.detailer_submit_check_in(text, uuid, int, text, text, text, text, text, text, boolean, boolean, text, text) to anon, authenticated;
grant execute on function public.detailer_add_check_in_photo(text, uuid, text, text) to anon, authenticated;
grant execute on function public.detailer_customer_ack(text, uuid, text) to anon, authenticated;
grant execute on function public.detailer_toggle_stage(text, uuid, text, boolean) to anon, authenticated;
grant execute on function public.detailer_start_handover(text, uuid) to anon, authenticated;
grant execute on function public.detailer_complete_booking(text, uuid) to anon, authenticated;
