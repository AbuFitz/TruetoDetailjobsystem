-- Signing up with an email that matches a walk-in customer (added by staff)
-- must only link to that record once the email is confirmed.
-- Run with scripts/db-test.sh (throwaway local Postgres, never production).
begin;

create temp table results (name text, ok boolean, detail text);

-- Staff added Pat as a walk-in, with a booking and a home address.
insert into public.customers (id, first_name, email, phone)
values ('00000000-0000-0000-0000-0000000000f1', 'Pat', 'pat@example.com', '07700 900111');
insert into public.customer_addresses (customer_id, label, line1, postcode)
values ('00000000-0000-0000-0000-0000000000f1', 'Home', '1 Secret Lane', 'HP1 1AA');

-- Someone else signs up with Pat's email but never confirms it.
insert into auth.users (id, email, raw_user_meta_data)
values ('00000000-0000-0000-0000-0000000000e1', 'PAT@example.com', '{"first_name": "Mallory"}');

insert into results
select 'an unconfirmed signup does not claim the walk-in record',
  auth_user_id is null and first_name = 'Pat', coalesce(auth_user_id::text, 'unclaimed') || ' ' || first_name
from public.customers where id = '00000000-0000-0000-0000-0000000000f1';

insert into results
select 'the unconfirmed signup gets a separate record of its own',
  count(*) = 1, count(*)::text
from public.customers where auth_user_id = '00000000-0000-0000-0000-0000000000e1';

-- The placeholder books something before confirming, then confirms.
insert into public.vehicles (customer_id, make, model, registration)
select id, 'Ford', 'Focus', 'AB12CDE' from public.customers where auth_user_id = '00000000-0000-0000-0000-0000000000e1';

update auth.users set email_confirmed_at = now() where id = '00000000-0000-0000-0000-0000000000e1';

insert into results
select 'confirming the email claims the walk-in record',
  auth_user_id = '00000000-0000-0000-0000-0000000000e1', coalesce(auth_user_id::text, 'unclaimed')
from public.customers where id = '00000000-0000-0000-0000-0000000000f1';

insert into results
select 'anything added before confirming moves across, and the placeholder is gone',
  (select count(*) from public.vehicles where customer_id = '00000000-0000-0000-0000-0000000000f1') = 1
  and (select count(*) from public.customers where auth_user_id = '00000000-0000-0000-0000-0000000000e1') = 1,
  (select count(*) from public.vehicles where customer_id = '00000000-0000-0000-0000-0000000000f1')::text;

-- A provider that confirms on signup (e.g. magic link) claims immediately.
insert into public.customers (id, first_name, email) values ('00000000-0000-0000-0000-0000000000f2', 'Robin', 'robin@example.com');
insert into auth.users (id, email, email_confirmed_at) values ('00000000-0000-0000-0000-0000000000e2', 'robin@example.com', now());
insert into results
select 'an already-confirmed signup claims straight away',
  auth_user_id = '00000000-0000-0000-0000-0000000000e2', coalesce(auth_user_id::text, 'unclaimed')
from public.customers where id = '00000000-0000-0000-0000-0000000000f2';

-- A brand new customer with no walk-in record just gets one row.
insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000e3', 'new@example.com');
update auth.users set email_confirmed_at = now() where id = '00000000-0000-0000-0000-0000000000e3';
insert into results
select 'a new customer ends up with exactly one record', count(*) = 1, count(*)::text
from public.customers where email = 'new@example.com';

do $$
declare r record; failed int := 0;
begin
  for r in select * from results loop
    raise notice '% %: %', case when r.ok then 'ok  ' else 'FAIL' end, r.name, r.detail;
    if not r.ok then failed := failed + 1; end if;
  end loop;
  if failed > 0 then raise exception '% signup claim check(s) failed', failed; end if;
end $$;

rollback;
