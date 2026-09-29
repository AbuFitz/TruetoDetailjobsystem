-- The whole booking workflow through the real database functions: website
-- request, tracking link, email claims, the shortened detailer procedure and
-- the live ETA. Run with scripts/db-test.sh (throwaway local Postgres).
begin;

create temp table results (name text, ok boolean, detail text);
grant all on results to anon, authenticated;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000a001', 'staff@truetodetail.co.uk'),
  ('00000000-0000-0000-0000-00000000c001', 'sam@example.com'),
  ('00000000-0000-0000-0000-00000000c002', 'alex@example.com');
insert into public.staff_users (id, name) values ('00000000-0000-0000-0000-00000000a001', 'Office');
insert into public.detailers (id, name, link_token, job_title, vehicle_description) values
  ('00000000-0000-0000-0000-0000000000d1', 'Jamie Clarke', 'tok-jamie-0001', 'Senior Detailer', 'White VW Transporter'),
  ('00000000-0000-0000-0000-0000000000d2', 'Leah Brooks', 'tok-leah-0002', 'Detailer', null);

create temp table ctx (k text primary key, v text);
grant all on ctx to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 1. Website request (called anonymously, as the website's server does)
-- ---------------------------------------------------------------------------
set local role anon;
set local request.jwt.claim.sub = '';

do $$
declare r jsonb; b record; n int;
begin
  r := public.submit_website_booking('Full Valet', 'midsize', (now() + interval '5 days')::date, '10:00 AM',
        'Jo Bloggs', '07700 900111', 'Jo@Example.com', 'hp2 6el', 'ab12 cde', array['engine-bay', 'engine-bay', 'steam'], 'Gate code 1234');
  insert into ctx values ('website_id', r ->> 'id'), ('website_token', r ->> 'tracking_token');
  insert into results values ('website request returns a reference and tracking token',
    (r ->> 'reference') like 'TTD-%' and length(r ->> 'tracking_token') >= 8, r ->> 'reference');
  insert into results values ('website request is priced from the price list (155 + 40 + 35)', (r ->> 'price')::numeric = 230, r ->> 'price');
end $$;

reset role;
insert into results
select 'website request is stored as requested, from the website, with a walk-in customer',
  b.status = 'requested' and b.source = 'website' and b.vehicle_registration = 'AB12CDE' and b.service_postcode = 'HP2 6EL'
  and c.auth_user_id is null and c.email = 'jo@example.com' and c.first_name = 'Jo' and c.last_name = 'Bloggs'
  and b.customer_notes = 'Gate code 1234' and b.addon_ids = array['engine-bay', 'steam'],
  concat_ws(' | ', b.status, b.source, c.email, c.first_name)
from public.bookings b join public.customers c on c.id = b.customer_id where b.id = (select v::uuid from ctx where k = 'website_id');

insert into results
select 'the slot is saved as UK time', b.scheduled_start at time zone 'Europe/London' = (b.scheduled_start at time zone 'Europe/London')::date + time '10:00',
  (b.scheduled_start at time zone 'Europe/London')::text
from public.bookings b where b.id = (select v::uuid from ctx where k = 'website_id');

set local role anon;
do $$
declare
  bad text[][] := array[
    array['unknown package', $q$select public.submit_website_booking('Gold', 'small', (now() + interval '3 days')::date, '10:00 AM', 'A', '07700 900111', 'a@example.com', 'HP2 6EL', 'AB12CDE')$q$],
    array['bad email', $q$select public.submit_website_booking('Essential', 'small', (now() + interval '3 days')::date, '10:00 AM', 'A', '07700 900111', 'not-an-email', 'HP2 6EL', 'AB12CDE')$q$],
    array['outside the area', $q$select public.submit_website_booking('Essential', 'small', (now() + interval '3 days')::date, '10:00 AM', 'A', '07700 900111', 'a@example.com', 'M1 1AA', 'AB12CDE')$q$],
    array['past date', $q$select public.submit_website_booking('Essential', 'small', (now() - interval '2 days')::date, '10:00 AM', 'A', '07700 900111', 'a@example.com', 'HP2 6EL', 'AB12CDE')$q$],
    array['odd time slot', $q$select public.submit_website_booking('Essential', 'small', (now() + interval '3 days')::date, '3:33 PM', 'A', '07700 900111', 'a@example.com', 'HP2 6EL', 'AB12CDE')$q$],
    array['unknown add-on', $q$select public.submit_website_booking('Essential', 'small', (now() + interval '3 days')::date, '10:00 AM', 'A', '07700 900111', 'a@example.com', 'HP2 6EL', 'AB12CDE', array['free-wax'])$q$],
    array['bad vehicle size', $q$select public.submit_website_booking('Essential', 'huge', (now() + interval '3 days')::date, '10:00 AM', 'A', '07700 900111', 'a@example.com', 'HP2 6EL', 'AB12CDE')$q$],
    array['bad phone', $q$select public.submit_website_booking('Essential', 'small', (now() + interval '3 days')::date, '10:00 AM', 'A', 'call me', 'a@example.com', 'HP2 6EL', 'AB12CDE')$q$],
    array['notes too long', format($q$select public.submit_website_booking('Essential', 'small', (now() + interval '3 days')::date, '10:00 AM', 'A', '07700 900111', 'a@example.com', 'HP2 6EL', 'AB12CDE', '{}', %L)$q$, repeat('x', 1001))]
  ];
  i int;
begin
  for i in 1 .. array_length(bad, 1) loop
    begin
      execute bad[i][2];
      insert into results values ('website request refuses ' || bad[i][1], false, 'was accepted');
    exception when others then
      insert into results values ('website request refuses ' || bad[i][1], true, sqlerrm);
    end;
  end loop;
end $$;

-- Same email again reuses the customer; the sixth request in a day is refused.
do $$
declare i int; msg text := 'no error'; n int;
begin
  for i in 1 .. 5 loop
    begin
      perform public.submit_website_booking('Essential', 'small', (now() + (i + 10 || ' days')::interval)::date, '2:00 PM', 'Jo Bloggs', '07700 900111', 'jo@example.com', 'HP2 6EL', 'AB12CDE');
    exception when others then msg := sqlerrm; end;
  end loop;
  insert into results values ('the sixth request from one email in a day is refused', msg like 'Too many requests%', msg);
end $$;
reset role;
insert into results select 'requests from one email share one customer record', count(*) = 1, count(*)::text from public.customers where email = 'jo@example.com';

-- ---------------------------------------------------------------------------
-- 2. Public tracking page
-- ---------------------------------------------------------------------------
set local role anon;
do $$
declare t jsonb; wrong jsonb;
begin
  t := public.get_tracked_booking((select v from ctx where k = 'website_token'));
  wrong := public.get_tracked_booking('not-a-real-token');
  insert into results values ('tracking link shows the booking', t ->> 'status' = 'requested' and t ->> 'package_name' = 'Full Valet Car Detail' and t ->> 'customer_first_name' = 'Jo', t ->> 'status');
  insert into results values ('a wrong token shows nothing', wrong is null, coalesce(wrong::text, 'null'));
  insert into results values ('tracking link does not reveal the street address, phone or email',
    t::text not like '%Address to be confirmed%' and t::text not like '%07700%' and t::text not like '%jo@example.com%', 'checked');
  insert into results values ('a requested booking has no live tracking yet', (t -> 'tracking') = 'null'::jsonb, coalesce((t -> 'tracking')::text, 'sql null'));
end $$;
reset role;

-- ---------------------------------------------------------------------------
-- 3. Emails: who may trigger them, and only once
-- ---------------------------------------------------------------------------
set local role anon;
do $$
begin
  begin
    perform public.claim_booking_email((select v::uuid from ctx where k = 'website_id'), 'booked_in');
    insert into results values ('a stranger cannot trigger an email', false, 'allowed');
  exception when others then insert into results values ('a stranger cannot trigger an email', sqlerrm = 'Not allowed', sqlerrm); end;
end $$;
reset role;

-- Staff confirm the request, then the "booked in" email can go, once.
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-00000000a001';
do $$
declare p jsonb; bid uuid := (select v::uuid from ctx where k = 'website_id');
begin
  p := public.claim_booking_email(bid, 'booked_in');
  insert into results values ('no booked-in email while the request is still a request', p is null, coalesce(p::text, 'null'));
  update public.bookings set status = 'confirmed' where public.bookings.id = bid;
  p := public.claim_booking_email(bid, 'booked_in');
  insert into results values ('staff confirming a request allows the booked-in email',
    p ->> 'customer_email' = 'jo@example.com' and length(p ->> 'tracking_token') >= 8 and (p ->> 'customer_has_account') = 'false' and p ->> 'package_name' = 'Full Valet Car Detail', coalesce(p ->> 'customer_email', 'null'));
  insert into results values ('the same email is never claimed twice', public.claim_booking_email(bid, 'booked_in') is null, 'second claim');
  insert into results values ('staff can force a resend', public.claim_booking_email(bid, 'booked_in', null, true) is not null, 'forced');
  perform public.release_booking_email(bid, 'booked_in');
  insert into results values ('a failed send can be released and retried', public.claim_booking_email(bid, 'booked_in') is not null, 'after release');
end $$;
reset role;

-- ---------------------------------------------------------------------------
-- 4. A customer books in the portal: tampering is ignored, they can trigger their own email
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-00000000c001';
insert into public.bookings (customer_id, service_address_line1, service_postcode, vehicle_registration, package_id, package_name,
  vehicle_size, price, scheduled_start, estimated_duration_minutes, source, tracking_token, status)
values ((select id from public.customers where auth_user_id = '00000000-0000-0000-0000-00000000c001'),
  '1 Test Road', 'WD17 1AA', 'SAM1', 'essential', 'x', 'small', 1, now() + interval '3 days', 5, 'website', 'chosen-by-customer', 'requested');
insert into ctx select 'portal_id', id::text from public.bookings where vehicle_registration = 'SAM1';
do $$
declare b record; p jsonb; bid uuid := (select v::uuid from ctx where k = 'portal_id');
begin
  select * into b from public.bookings where public.bookings.id = bid;
  insert into results values ('a customer cannot choose their own source, token or status',
    b.source = 'portal' and b.tracking_token <> 'chosen-by-customer' and b.status = 'confirmed' and b.price = 80, concat_ws(' | ', b.source, b.status, b.price));
  p := public.claim_booking_email(bid, 'booked_in');
  insert into results values ('a customer can trigger the booked-in email for their own new booking', p ->> 'customer_email' = 'sam@example.com', coalesce(p ->> 'customer_email', 'null'));
  begin
    perform public.claim_booking_email((select v::uuid from ctx where k = 'website_id'), 'booked_in');
    insert into results values ('a customer cannot trigger emails for someone else''s booking', false, 'allowed');
  exception when others then insert into results values ('a customer cannot trigger emails for someone else''s booking', true, sqlerrm); end;
end $$;
reset role;

-- Staff-created bookings are marked as staff bookings.
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-00000000a001';
insert into public.bookings (customer_id, service_address_line1, service_postcode, vehicle_registration, package_id, package_name,
  vehicle_size, price, scheduled_start, estimated_duration_minutes, status)
values ((select id from public.customers where auth_user_id = '00000000-0000-0000-0000-00000000c001'),
  '2 Test Road', 'HP1 1AA', 'STAFF1', 'full-valet', 'Full Valet Car Detail', 'small', 140, now() + interval '2 days', 270, 'confirmed');
reset role;
insert into results select 'a booking made by staff is marked as staff', source = 'staff', source from public.bookings where vehicle_registration = 'STAFF1';

-- ---------------------------------------------------------------------------
-- 5. The job on the day, with the shortened procedure
-- ---------------------------------------------------------------------------
select set_config('ttd.job', (select id::text from public.bookings where vehicle_registration = 'STAFF1'), true);

set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-00000000a001';
update public.bookings set assigned_detailer_id = '00000000-0000-0000-0000-0000000000d1', status = 'assigned', assigned_at = now()
  where id = current_setting('ttd.job')::uuid;
reset role;

-- Test-only readers so the anonymous detailer session can be inspected.
create function public._t_booking(p_id uuid) returns public.bookings language sql security definer set search_path = public as
$f$ select * from public.bookings where id = p_id $f$;
create function public._t_count(p_table text, p_id uuid) returns int language plpgsql security definer set search_path = public as
$f$ declare n int; begin execute format('select count(*) from public.%I where booking_id = $1', p_table) into n using p_id; return n; end $f$;
create function public._t_ack(p_id uuid) returns text language sql security definer set search_path = public as
$f$ select customer_ack_name from public.check_ins where booking_id = p_id $f$;
create function public._t_open_stages(p_id uuid) returns int language sql security definer set search_path = public as
$f$ select count(*)::int from public.booking_stage_progress where booking_id = p_id and completed_at is null $f$;
grant execute on function public._t_open_stages(uuid) to anon;
grant execute on function public._t_booking(uuid), public._t_count(text, uuid), public._t_ack(uuid) to anon;

set local role anon;
set local request.jwt.claim.sub = '';
do $$
declare
  job uuid := current_setting('ttd.job')::uuid;
  tok text := 'tok-jamie-0001';
  b record; t jsonb; p jsonb; n int;
begin
  begin
    perform public.detailer_start_journey('tok-leah-0002', job, 51.7, -0.4);
    insert into results values ('another detailer cannot start this job', false, 'allowed');
  exception when others then insert into results values ('another detailer cannot start this job', true, sqlerrm); end;

  perform public.detailer_start_journey(tok, job, 51.75, -0.47);
  perform public.detailer_update_location(tok, job, 51.74, -0.46, 780);
  select * into b from public._t_booking(job);
  insert into results values ('starting the journey sets en route with live tracking', b.status = 'en_route' and b.tracking_active, b.status);
  insert into results values ('the detailer''s ETA is stored with the location', b.eta_seconds = 780 and b.eta_updated_at is not null, b.eta_seconds::text);

  perform public.detailer_update_location(tok, job, 51.73, -0.45);
  select * into b from public._t_booking(job);
  insert into results values ('a location update without an ETA keeps the last ETA', b.eta_seconds = 780, b.eta_seconds::text);

  t := public.get_tracked_booking(b.tracking_token);
  insert into results values ('the tracking page shows the detailer, live position and ETA',
    t -> 'detailer' ->> 'first_name' = 'Jamie' and (t -> 'tracking' ->> 'eta_seconds')::int = 780 and (t -> 'tracking' ->> 'lat')::float = 51.73, t -> 'detailer' ->> 'first_name');
  insert into results values ('the detailer''s surname and phone are not on the tracking page', t::text not like '%Clarke%', 'checked');

  p := public.claim_booking_email(job, 'on_the_way', tok);
  insert into results values ('the detailer on the job can trigger the on-the-way email', p ->> 'detailer_first_name' = 'Jamie', coalesce(p ->> 'detailer_first_name', 'null'));
  begin
    perform public.claim_booking_email(job, 'on_the_way', 'tok-leah-0002', true);
    insert into results values ('another detailer cannot trigger it', false, 'allowed');
  exception when others then insert into results values ('another detailer cannot trigger it', true, sqlerrm); end;
  begin
    perform public.claim_booking_email(job, 'completed', tok);
    insert into results values ('the completed email is not ready before the job is complete', true, 'returned nothing');
  exception when others then insert into results values ('the completed email is not ready before the job is complete', false, sqlerrm); end;

  perform public.detailer_mark_arrived(tok, job);
  select * into b from public._t_booking(job);
  insert into results values ('arriving clears live tracking and the ETA', b.status = 'arrived' and not b.tracking_active and b.eta_seconds is null and b.current_lat is null, b.status);

  -- Check-in straight from "arrived" (no separate start step).
  perform public.detailer_submit_check_in(tok, job, 12000, 'none', 'none', 'clean', 'none', null, 'gate open', true, true, 'on the drive', null);
  select * into b from public._t_booking(job);
  n := public._t_count('booking_stage_progress', job);
  insert into results values ('check-in from arrived starts the job with a four item checklist', b.status = 'in_progress' and n = 4, concat_ws(' | ', b.status, n));

  perform public.detailer_toggle_stage(tok, job, 'exterior', true);
  perform public.detailer_toggle_stage(tok, job, 'interior', true);
  perform public.detailer_toggle_stage(tok, job, 'protection', true);
  select status into b.status from public._t_booking(job);
  insert into results values ('ticking stages does not change the booking status', b.status = 'in_progress', b.status);

  begin
    perform public.detailer_finish_job('tok-leah-0002', job, 'Sam');
    insert into results values ('another detailer cannot finish this job', false, 'finished');
  exception when others then insert into results values ('another detailer cannot finish this job', true, sqlerrm); end;

  perform public.detailer_finish_job(tok, job, 'Sam');
  select * into b from public._t_booking(job);
  insert into results values ('finishing completes the job in one step', b.status = 'completed' and b.completed_at is not null, b.status);
  insert into results values ('finishing marks any item still open as done', public._t_open_stages(job) = 0, public._t_open_stages(job)::text);
  insert into results values ('the customer''s name is recorded at handover', public._t_ack(job) = 'Sam', 'ack');

  p := public.claim_booking_email(job, 'completed', tok);
  insert into results values ('the detailer can trigger the completed email', p ->> 'status' = 'completed', coalesce(p ->> 'status', 'null'));
end $$;
reset role;

-- ---------------------------------------------------------------------------
-- 6. Cancelling a request
-- ---------------------------------------------------------------------------
-- A website request belonging to Sam (inserted the way submit_website_booking does).
insert into public.bookings (customer_id, service_address_line1, service_postcode, vehicle_registration, package_id, package_name,
  vehicle_size, price, scheduled_start, estimated_duration_minutes, status, source)
values ((select id from public.customers where auth_user_id = '00000000-0000-0000-0000-00000000c001'),
  'x', 'HP1 1AA', 'REQ1', 'essential', 'Essential Car Detail', 'small', 80, now() + interval '4 days', 150, 'requested', 'website');
insert into ctx select 'req_id', id::text from public.bookings where vehicle_registration = 'REQ1';
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-00000000c001';
do $$
declare bid uuid := (select v::uuid from ctx where k = 'req_id');
begin
  perform public.cancel_own_booking(bid, 'Change of plans');
  insert into results select 'a customer can cancel a request', status = 'cancelled', status from public.bookings where public.bookings.id = bid;
end $$;
reset role;

do $$
declare r record; failed int := 0;
begin
  for r in select * from results loop
    raise notice '% %: %', case when r.ok then 'ok  ' else 'FAIL' end, r.name, r.detail;
    if not r.ok then failed := failed + 1; end if;
  end loop;
  if failed > 0 then raise exception '% workflow check(s) failed', failed; end if;
end $$;

rollback;
