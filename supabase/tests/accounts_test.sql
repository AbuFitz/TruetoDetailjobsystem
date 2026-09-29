-- Staff create a customer account with a temporary password; the customer
-- must change it; only staff can do any of this.
-- Run with scripts/db-test.sh (throwaway local Postgres, never production).
begin;

create temp table results (name text, ok boolean, detail text);
grant all on results to authenticated;

insert into auth.users (id, email) values ('00000000-0000-0000-0000-00000000a001', 'office@example.com');
insert into public.staff_users (id, name) values ('00000000-0000-0000-0000-00000000a001', 'Office');
insert into public.customers (id, first_name, last_name, email, phone)
values ('00000000-0000-0000-0000-0000000000b1', 'Ali', 'Khan', 'Ali@Example.com', '07700 900222'),
       ('00000000-0000-0000-0000-0000000000b2', 'NoMail', null, null, '07700 900333');
insert into public.bookings (customer_id, service_address_line1, service_postcode, vehicle_registration, package_id, package_name,
  vehicle_size, price, scheduled_start, estimated_duration_minutes, status)
values ('00000000-0000-0000-0000-0000000000b1', '1 Test Road', 'HP1 1AA', 'ALI1', 'essential', 'Essential', 'small', 80, now() + interval '3 days', 150, 'confirmed');

-- Someone who is not staff is refused.
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000cc';
do $$
begin
  begin
    perform public.admin_create_customer_account('00000000-0000-0000-0000-0000000000b1');
    insert into results values ('a customer cannot create accounts', false, 'allowed');
  exception when others then insert into results values ('a customer cannot create accounts', sqlerrm like 'Only staff%', sqlerrm); end;
  begin
    perform public.admin_reset_customer_password('00000000-0000-0000-0000-0000000000b1');
    insert into results values ('a customer cannot reset passwords', false, 'allowed');
  exception when others then insert into results values ('a customer cannot reset passwords', sqlerrm like 'Only staff%', sqlerrm); end;
end $$;
reset role;

-- Staff create the account.
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-00000000a001';
select set_config('ttd.out', public.admin_create_customer_account('00000000-0000-0000-0000-0000000000b1')::text, true);
do $$
declare o jsonb := current_setting('ttd.out')::jsonb;
begin
  insert into results values ('a readable temporary password comes back', o ->> 'temp_password' ~ '^[A-Za-z2-9]{4}-[A-Za-z2-9]{4}-[A-Za-z2-9]{4}$' and o ->> 'temp_password' !~ '[0OoIl1]', o ->> 'temp_password');
  insert into results values ('the sign-in email is lower case', o ->> 'email' = 'ali@example.com', o ->> 'email');
  begin
    perform public.admin_create_customer_account('00000000-0000-0000-0000-0000000000b1');
    insert into results values ('a second account for the same customer is refused', false, 'allowed');
  exception when others then insert into results values ('a second account for the same customer is refused', sqlerrm like '%already has an account%', sqlerrm); end;
  begin
    perform public.admin_create_customer_account('00000000-0000-0000-0000-0000000000b2');
    insert into results values ('a customer without an email is refused', false, 'allowed');
  exception when others then insert into results values ('a customer without an email is refused', sqlerrm like 'Add an email%', sqlerrm); end;
  begin
    perform public.admin_reset_customer_password('00000000-0000-0000-0000-0000000000b2');
    insert into results values ('resetting a customer with no account is refused', false, 'allowed');
  exception when others then insert into results values ('resetting a customer with no account is refused', sqlerrm like '%no account%', sqlerrm); end;
end $$;
reset role;

do $$
declare c record; u record; o jsonb := current_setting('ttd.out')::jsonb; n int;
begin
  select * into c from public.customers where id = '00000000-0000-0000-0000-0000000000b1';
  select * into u from auth.users where lower(email) = 'ali@example.com';
  select count(*) into n from public.customers where auth_user_id = u.id;
  insert into results values ('the account is linked to the existing customer, not a new one', c.auth_user_id = u.id and n = 1, coalesce(c.auth_user_id::text, 'null'));
  insert into results values ('their booking is still theirs', (select count(*) from public.bookings where customer_id = c.id) = 1, 'bookings');
  insert into results values ('the email is confirmed so they can sign in straight away', u.email_confirmed_at is not null, coalesce(u.email_confirmed_at::text, 'null'));
  insert into results values ('the password is stored as a hash that matches', u.encrypted_password = extensions.crypt(o ->> 'temp_password', u.encrypted_password) and u.encrypted_password <> o ->> 'temp_password', 'bcrypt');
  insert into results values ('sign-in fields are empty strings, not nulls', u.confirmation_token = '' and u.recovery_token = '' and u.email_change = '', 'tokens');
  insert into results values ('an email identity exists', exists (select 1 from auth.identities where user_id = u.id and provider = 'email' and provider_id = u.id::text), 'identity');
  insert into results values ('they are told to change the password', c.must_change_password, c.must_change_password::text);
  select count(*) into n from public.customers where email ilike 'ali@example.com';
  insert into results values ('there is only one customer with that email', n = 1, n::text);
end $$;

-- The customer signs in and tries to skip the change.
select set_config('ttd.ali', (select id::text from auth.users where lower(email) = 'ali@example.com'), true);
set local role authenticated;
select set_config('request.jwt.claim.sub', current_setting('ttd.ali'), true);
do $$
begin
  update public.customers set must_change_password = false where auth_user_id = auth.uid();
  insert into results values ('a customer cannot switch the prompt off themselves', (select must_change_password from public.customers where auth_user_id = auth.uid()), 'still true');
  begin
    perform public.customer_password_changed();
    insert into results values ('the prompt stays until the password really changes', false, 'cleared');
  exception when others then insert into results values ('the prompt stays until the password really changes', sqlerrm like 'Choose a new password%', sqlerrm); end;
end $$;
reset role;

-- They set their own password (the auth service updates the hash), then confirm.
update auth.users set encrypted_password = extensions.crypt('my-own-new-password', extensions.gen_salt('bf')) where lower(email) = 'ali@example.com';
select set_config('ttd.ali', (select id::text from auth.users where lower(email) = 'ali@example.com'), true);
set local role authenticated;
select set_config('request.jwt.claim.sub', current_setting('ttd.ali'), true);
do $$
begin
  insert into results values ('after a real change the prompt clears', public.customer_password_changed(), 'cleared');
  insert into results values ('the customer flag is now off', not (select must_change_password from public.customers where auth_user_id = auth.uid()), 'off');
end $$;
reset role;
insert into results select 'the pending record is gone', count(*) = 0, count(*)::text from public.pending_password_changes;

-- Staff reset it: signed out everywhere, prompt back on, new temp password works.
insert into auth.sessions (user_id) select id from auth.users where lower(email) = 'ali@example.com';
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-00000000a001';
select set_config('ttd.out2', public.admin_reset_customer_password('00000000-0000-0000-0000-0000000000b1', 'Chosen-By-Staff-9')::text, true);
reset role;
do $$
declare u record;
begin
  select * into u from auth.users where lower(email) = 'ali@example.com';
  insert into results values ('a reset stores the new temporary password', u.encrypted_password = extensions.crypt('Chosen-By-Staff-9', u.encrypted_password), 'bcrypt');
  insert into results values ('a reset signs the customer out everywhere', not exists (select 1 from auth.sessions where user_id = u.id), 'sessions');
  insert into results values ('a reset turns the change prompt back on', (select must_change_password from public.customers where auth_user_id = u.id), 'on');
  begin
    set local role authenticated;
    perform public.admin_reset_customer_password('00000000-0000-0000-0000-0000000000b1', 'short');
    reset role;
    insert into results values ('a short temporary password is refused', false, 'allowed');
  exception when others then reset role; insert into results values ('a short temporary password is refused', sqlerrm like '%at least 10%' or sqlerrm like 'Only staff%', sqlerrm); end;
end $$;

-- Nobody outside the database functions can read the pending hashes.
set local role authenticated;
do $$
begin
  begin
    perform 1 from public.pending_password_changes;
    insert into results values ('pending password hashes are not readable through the API', false, 'readable');
  exception when others then insert into results values ('pending password hashes are not readable through the API', true, sqlerrm); end;
end $$;
reset role;

do $$
declare r record; failed int := 0;
begin
  for r in select * from results loop
    raise notice '% %: %', case when r.ok then 'ok  ' else 'FAIL' end, r.name, r.detail;
    if not r.ok then failed := failed + 1; end if;
  end loop;
  if failed > 0 then raise exception '% account check(s) failed', failed; end if;
end $$;

rollback;
