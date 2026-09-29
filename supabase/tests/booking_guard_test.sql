-- A signed-in customer creating a booking straight through the API must not
-- be able to set their own price, skip the queue or touch staff-only fields.
-- Run with scripts/db-test.sh (throwaway local Postgres, never production).
begin;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000c001', 'sam@example.com'),
  ('00000000-0000-0000-0000-00000000c002', 'alex@example.com'),
  ('00000000-0000-0000-0000-00000000a001', 'staff@truetodetail.co.uk');
insert into public.staff_users (id, name) values ('00000000-0000-0000-0000-00000000a001', 'Office');
insert into public.detailers (id, name) values ('00000000-0000-0000-0000-0000000000d1', 'Jamie');

create temp table results (name text, ok boolean, detail text);
grant all on results to authenticated;

-- A booking as the customer would send it, with everything they might try to fake.
create temp view attempt as select
  (select id from public.customers where email = 'sam@example.com') as customer_id,
  '14 Road' as service_address_line1, 'HP2 6EL' as service_postcode, 'AB12CDE' as vehicle_registration,
  'premium-detail' as package_id, 'Cheap Detail' as package_name, 'largesuv' as vehicle_size,
  array['engine-bay', 'engine-bay', 'steam']::text[] as addon_ids, array['Free stuff']::text[] as addon_labels,
  1.00::numeric as price, now() + interval '3 days' as scheduled_start, 5 as estimated_duration_minutes;
grant select on attempt to authenticated;

set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-00000000c001';

insert into public.bookings (
  customer_id, service_address_line1, service_postcode, vehicle_registration, package_id, package_name,
  vehicle_size, addon_ids, addon_labels, price, scheduled_start, estimated_duration_minutes,
  assigned_detailer_id, internal_notes, tracking_active, completed_at, travel_time_minutes
)
select customer_id, service_address_line1, service_postcode, vehicle_registration, package_id, package_name,
  vehicle_size, addon_ids, addon_labels, price, scheduled_start, estimated_duration_minutes,
  '00000000-0000-0000-0000-0000000000d1', 'VIP, no charge', true, now(), 0
from attempt;

insert into results
select 'price comes from the price list, not the request', price = 270 + 40 + 35, price::text from public.bookings
union all
select 'package name, labels and duration are the real ones',
  package_name = 'Premium Full Car Detail' and addon_labels = array['Engine Bay Clean', 'Interior Steam Sanitisation'] and estimated_duration_minutes = 390,
  concat_ws(' | ', package_name, addon_labels::text, estimated_duration_minutes)
from public.bookings
union all
select 'duplicate add-ons are charged once', addon_ids = array['engine-bay', 'steam'], addon_ids::text from public.bookings
union all
select 'staff-only fields are reset',
  assigned_detailer_id is null and internal_notes is null and not tracking_active and completed_at is null and travel_time_minutes is null and status = 'confirmed',
  concat_ws(' | ', assigned_detailer_id, internal_notes, tracking_active, completed_at, status)
from public.bookings;

-- Each of these must be refused outright.
do $$
declare
  cases text[][] := array[
    array['unknown package', $q$insert into public.bookings (customer_id, service_address_line1, service_postcode, vehicle_registration, package_id, package_name, vehicle_size, price, scheduled_start, estimated_duration_minutes) select customer_id, 'x', 'HP2 6EL', 'X', 'gold-plated', 'x', 'small', 0, now() + interval '2 days', 60 from attempt$q$],
    array['unknown add-on', $q$insert into public.bookings (customer_id, service_address_line1, service_postcode, vehicle_registration, package_id, package_name, vehicle_size, addon_ids, price, scheduled_start, estimated_duration_minutes) select customer_id, 'x', 'HP2 6EL', 'X', 'essential', 'x', 'small', array['free-wax'], 0, now() + interval '2 days', 60 from attempt$q$],
    array['time in the past', $q$insert into public.bookings (customer_id, service_address_line1, service_postcode, vehicle_registration, package_id, package_name, vehicle_size, price, scheduled_start, estimated_duration_minutes) select customer_id, 'x', 'HP2 6EL', 'X', 'essential', 'x', 'small', 80, now() - interval '1 day', 60 from attempt$q$],
    array['less than an hour away', $q$insert into public.bookings (customer_id, service_address_line1, service_postcode, vehicle_registration, package_id, package_name, vehicle_size, price, scheduled_start, estimated_duration_minutes) select customer_id, 'x', 'HP2 6EL', 'X', 'essential', 'x', 'small', 80, now() + interval '20 minutes', 60 from attempt$q$],
    array['someone else''s account', $q$insert into public.bookings (customer_id, service_address_line1, service_postcode, vehicle_registration, package_id, package_name, vehicle_size, price, scheduled_start, estimated_duration_minutes) select (select id from public.customers where email = 'alex@example.com'), 'x', 'HP2 6EL', 'X', 'essential', 'x', 'small', 80, now() + interval '2 days', 60$q$],
    array['outside the service area', $q$insert into public.bookings (customer_id, service_address_line1, service_postcode, vehicle_registration, package_id, package_name, vehicle_size, price, scheduled_start, estimated_duration_minutes) select customer_id, 'x', 'M1 1AA', 'X', 'essential', 'x', 'small', 80, now() + interval '2 days', 60 from attempt$q$]
  ];
  i int;
begin
  for i in 1 .. array_length(cases, 1) loop
    begin
      execute cases[i][2];
      insert into results values ('refuses ' || cases[i][1], false, 'insert was allowed');
    exception when others then
      insert into results values ('refuses ' || cases[i][1], true, sqlerrm);
    end;
  end loop;
end $$;

-- Cancelling: own confirmed booking works; anything else gets a friendly message.
do $$
declare v_id uuid;
begin
  select id into v_id from public.bookings where price = 345;
  perform public.cancel_own_booking(v_id, 'Change of plans');
  insert into results select 'a customer can cancel their own confirmed booking', status = 'cancelled', status from public.bookings where id = v_id;
  begin
    perform public.cancel_own_booking(v_id);
    insert into results values ('cancelling twice is refused', false, 'allowed');
  exception when others then
    insert into results values ('cancelling twice is refused with a friendly message', sqlerrm not like '%—%' and sqlerrm like '%07359 591800%', sqlerrm);
  end;
end $$;

-- A trusted connection with no signed-in user (SQL editor) is not re-priced.
reset role;
set local request.jwt.claim.sub = '';
insert into public.bookings (customer_id, service_address_line1, service_postcode, vehicle_registration, package_id, package_name,
  vehicle_size, price, scheduled_start, estimated_duration_minutes, internal_notes)
select customer_id, 'x', 'HP2 6EL', 'X', 'essential', 'Essential Car Detail', 'small', 50, now() - interval '2 days', 150, 'Entered by hand' from attempt;
insert into results select 'a direct database insert keeps its own price and date', price = 50, price::text
from public.bookings where internal_notes = 'Entered by hand';

-- Staff keep full control, including custom prices and assigning up front.
reset role;
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-00000000a001';
insert into public.bookings (customer_id, service_address_line1, service_postcode, vehicle_registration, package_id, package_name,
  vehicle_size, price, scheduled_start, estimated_duration_minutes, assigned_detailer_id, internal_notes, status)
select customer_id, 'x', 'HP2 6EL', 'X', 'essential', 'Essential Car Detail', 'small', 60, now() - interval '1 day', 150,
  '00000000-0000-0000-0000-0000000000d1', 'Loyalty discount', 'assigned' from attempt;
insert into results
select 'staff can still set a custom price, past date and detailer',
  price = 60 and internal_notes = 'Loyalty discount' and assigned_detailer_id is not null,
  price::text
from public.bookings where internal_notes = 'Loyalty discount';

reset role;
do $$
declare r record; failed int := 0;
begin
  for r in select * from results loop
    raise notice '% %: %', case when r.ok then 'ok  ' else 'FAIL' end, r.name, r.detail;
    if not r.ok then failed := failed + 1; end if;
  end loop;
  if failed > 0 then raise exception '% booking guard check(s) failed', failed; end if;
end $$;

rollback;
