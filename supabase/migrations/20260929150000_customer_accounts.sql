-- Staff can create a customer's portal account from the admin console, give
-- them a temporary password, reset it later, and the customer is made to
-- choose their own password the first time they sign in. Everything runs
-- inside the database as staff-only functions; no service key is involved.

alter table public.customers
  add column if not exists must_change_password boolean not null default false;

comment on column public.customers.must_change_password is
  'True while the customer is still on a password staff gave them. The portal '
  'sends them to a change-password screen before anything else.';

-- Hash of the temporary password, kept out of every API-visible table so the
-- customer cannot clear the flag without really changing their password.
create table if not exists public.pending_password_changes (
  customer_id uuid primary key references public.customers(id) on delete cascade,
  temp_hash text not null,
  created_at timestamptz not null default now()
);
alter table public.pending_password_changes enable row level security;
revoke all on public.pending_password_changes from public, anon, authenticated;

-- Only staff or the password-changed function may flip the flag.
create or replace function public.guard_must_change_password()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.must_change_password is distinct from old.must_change_password
     and not (public.is_staff() or coalesce(current_setting('ttd.pw_flag', true), '') = '1')
     and auth.uid() is not null then
    new.must_change_password := old.must_change_password;
  end if;
  return new;
end;
$$;

drop trigger if exists customers_guard_must_change_password on public.customers;
create trigger customers_guard_must_change_password
  before update on public.customers
  for each row execute function public.guard_must_change_password();

-- A readable temporary password: no 0/O/1/l/I, three groups of four.
create or replace function public.generate_temp_password()
returns text
language plpgsql
volatile
set search_path = public, extensions
as $$
declare
  alphabet constant text := 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  bytes bytea := extensions.gen_random_bytes(12);
  out text := '';
begin
  for i in 0..11 loop
    out := out || substr(alphabet, (get_byte(bytes, i) % length(alphabet)) + 1, 1);
    if i in (3, 7) then out := out || '-'; end if;
  end loop;
  return out;
end;
$$;
revoke all on function public.generate_temp_password() from public, anon, authenticated;

create or replace function public.admin_create_customer_account(p_customer_id uuid, p_temp_password text default null)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  c public.customers%rowtype;
  v_uid uuid := gen_random_uuid();
  v_pw text := coalesce(nullif(btrim(p_temp_password), ''), public.generate_temp_password());
  v_hash text;
  v_own uuid;
begin
  if not public.is_staff() then
    raise exception 'Only staff can create customer accounts.';
  end if;
  if length(v_pw) < 10 then
    raise exception 'The temporary password needs at least 10 characters.';
  end if;

  select * into c from public.customers where id = p_customer_id for update;
  if not found then raise exception 'Customer not found.'; end if;
  if c.auth_user_id is not null then raise exception 'This customer already has an account.'; end if;
  if c.email is null or btrim(c.email) = '' then
    raise exception 'Add an email address to this customer first. It becomes their sign-in.';
  end if;
  if exists (select 1 from auth.users where lower(email) = lower(btrim(c.email))) then
    raise exception 'An account with this email already exists. Use the password reset instead.';
  end if;

  v_hash := extensions.crypt(v_pw, extensions.gen_salt('bf'));

  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, recovery_token, email_change_token_new, email_change,
    email_change_token_current, phone_change, phone_change_token, reauthentication_token,
    is_sso_user, is_anonymous
  ) values (
    '00000000-0000-0000-0000-000000000000', v_uid, 'authenticated', 'authenticated',
    lower(btrim(c.email)), v_hash, now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    jsonb_strip_nulls(jsonb_build_object('first_name', c.first_name, 'last_name', c.last_name, 'phone', c.phone)),
    now(), now(),
    '', '', '', '', '', '', '', '', false, false
  );

  insert into auth.identities (id, user_id, provider_id, provider, identity_data, last_sign_in_at, created_at, updated_at)
  values (
    gen_random_uuid(), v_uid, v_uid::text, 'email',
    jsonb_build_object('sub', v_uid::text, 'email', lower(btrim(c.email)), 'email_verified', true, 'phone_verified', false),
    null, now(), now()
  );

  -- The new-user trigger normally links the record by email. Make sure it is
  -- this exact customer, and drop any placeholder it made instead.
  select id into v_own from public.customers where auth_user_id = v_uid;
  if v_own is distinct from p_customer_id then
    if v_own is not null then delete from public.customers where id = v_own; end if;
    update public.customers set auth_user_id = v_uid where id = p_customer_id;
  end if;

  perform set_config('ttd.pw_flag', '1', true);
  update public.customers set must_change_password = true where id = p_customer_id;
  perform set_config('ttd.pw_flag', '', true);

  insert into public.pending_password_changes (customer_id, temp_hash)
  values (p_customer_id, v_hash)
  on conflict (customer_id) do update set temp_hash = excluded.temp_hash, created_at = now();

  return jsonb_build_object('email', lower(btrim(c.email)), 'temp_password', v_pw);
end;
$$;

create or replace function public.admin_reset_customer_password(p_customer_id uuid, p_temp_password text default null)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  c public.customers%rowtype;
  v_pw text := coalesce(nullif(btrim(p_temp_password), ''), public.generate_temp_password());
  v_hash text;
begin
  if not public.is_staff() then
    raise exception 'Only staff can reset customer passwords.';
  end if;
  if length(v_pw) < 10 then
    raise exception 'The temporary password needs at least 10 characters.';
  end if;

  select * into c from public.customers where id = p_customer_id for update;
  if not found then raise exception 'Customer not found.'; end if;
  if c.auth_user_id is null then raise exception 'This customer has no account yet. Create one first.'; end if;

  v_hash := extensions.crypt(v_pw, extensions.gen_salt('bf'));
  update auth.users set encrypted_password = v_hash, updated_at = now() where id = c.auth_user_id;
  -- Sign them out everywhere so the old password stops working at once.
  delete from auth.sessions where user_id = c.auth_user_id;

  perform set_config('ttd.pw_flag', '1', true);
  update public.customers set must_change_password = true where id = p_customer_id;
  perform set_config('ttd.pw_flag', '', true);

  insert into public.pending_password_changes (customer_id, temp_hash)
  values (p_customer_id, v_hash)
  on conflict (customer_id) do update set temp_hash = excluded.temp_hash, created_at = now();

  return jsonb_build_object('email', c.email, 'temp_password', v_pw);
end;
$$;

-- Called by the customer after they set their own password. It only clears
-- the flag if the stored password really is different from the temporary one.
create or replace function public.customer_password_changed()
returns boolean
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_cid uuid := public.my_customer_id();
  v_temp text;
  v_now text;
begin
  if v_cid is null then return false; end if;
  select temp_hash into v_temp from public.pending_password_changes where customer_id = v_cid;
  select encrypted_password into v_now from auth.users where id = auth.uid();
  if v_temp is not null and v_now = v_temp then
    raise exception 'Choose a new password first.';
  end if;
  perform set_config('ttd.pw_flag', '1', true);
  update public.customers set must_change_password = false where id = v_cid;
  perform set_config('ttd.pw_flag', '', true);
  delete from public.pending_password_changes where customer_id = v_cid;
  return true;
end;
$$;

revoke all on function public.admin_create_customer_account(uuid, text) from public, anon;
revoke all on function public.admin_reset_customer_password(uuid, text) from public, anon;
revoke all on function public.customer_password_changed() from public, anon;
grant execute on function public.admin_create_customer_account(uuid, text) to authenticated;
grant execute on function public.admin_reset_customer_password(uuid, text) to authenticated;
grant execute on function public.customer_password_changed() to authenticated;
