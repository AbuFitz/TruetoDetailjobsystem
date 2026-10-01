-- A booking made in the portal is a request, not a confirmed booking.
--
-- Until now the portal locked a booking in the moment it was made: the guard
-- trigger forced status 'confirmed' and the insert policy required it. Now a
-- customer's booking starts as 'requested', shows in the admin console under
-- "Needs confirming", and only becomes 'confirmed' when staff approve it
-- (the same step website requests already go through).
--
-- Two new emails are claimed through claim_booking_email, each sent once:
--   received     to the customer: "we have your request", with their tracking link
--   staff_alert  to the team: a new portal request is waiting
-- The "booked in" confirmation is now staff-only: it goes out when staff approve.

-- 1. A customer's new booking is a request.
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

  new.status := 'requested';
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

drop policy if exists "Customers create own bookings" on public.bookings;
create policy "Customers create own bookings"
  on public.bookings for insert
  to authenticated
  with check (
    customer_id = public.my_customer_id()
    and status = 'requested'
    and public.is_postcode_covered(service_postcode)
  );

-- 2. The email log knows the two new kinds.
do $$
declare c record;
begin
  for c in
    select conname from pg_constraint
    where conrelid = 'public.booking_notifications'::regclass and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%kind%'
  loop
    execute format('alter table public.booking_notifications drop constraint %I', c.conname);
  end loop;
end $$;
alter table public.booking_notifications
  add constraint booking_notifications_kind_check
  check (kind in ('received', 'staff_alert', 'booked_in', 'assigned', 'on_the_way', 'completed', 'cancelled'));

-- 3. Who may trigger which email.
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

  -- A customer can trigger the two "request made" emails for a booking they
  -- have just made themselves in the portal. Confirming it is staff's call.
  if p_kind in ('received', 'staff_alert') and b.source = 'portal'
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
    when 'received' then b.status = 'requested'
    when 'staff_alert' then b.status = 'requested'
    when 'booked_in' then b.status not in ('requested', 'cancelled')
    when 'assigned' then b.assigned_detailer_id is not null and b.status not in ('requested', 'cancelled', 'completed')
    when 'on_the_way' then b.status = 'en_route'
    when 'completed' then b.status = 'completed'
    when 'cancelled' then b.status = 'cancelled'
    else false
  end;
$$;
revoke all on function public._booking_email_ready(public.bookings, text) from public, anon, authenticated;

-- 4. The claim: the two new kinds, and the customer's name, phone and notes
--    (the team's alert needs them).
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
  if p_kind not in ('received', 'staff_alert', 'booked_in', 'assigned', 'on_the_way', 'completed', 'cancelled') then
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
      'customer_last_name', c.last_name,
      'customer_phone', c.phone,
      'customer_notes', b.customer_notes,
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
