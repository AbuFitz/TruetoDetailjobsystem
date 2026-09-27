-- True To Detail Job System — customer accounts and staff.
--
-- Unlike FixNow Mechanics Tracking (no customer accounts at all — see its
-- AGENTS.md), a mobile detailing booking system needs real customer
-- accounts: the customer dashboard, saved addresses, "Your Garage" and TTD
-- Rewards all depend on a durable identity across visits. So both customers
-- and staff are real Supabase Auth users; `staff_users` is what
-- distinguishes an internal True To Detail account from an ordinary
-- customer one, and every RLS policy in this app is written in terms of
-- `public.is_staff()` vs. `customer_id = auth.uid()`.

create table if not exists public.customers (
  id uuid primary key references auth.users(id) on delete cascade,
  first_name text not null,
  last_name text,
  phone text,
  email text,
  created_at timestamptz not null default now()
);

comment on table public.customers is
  'One row per customer account, keyed 1:1 to auth.users. Created '
  'automatically by handle_new_user() on signup — see below.';

alter table public.customers enable row level security;

create table if not exists public.staff_users (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now()
);

comment on table public.staff_users is
  'Marks an auth.users row as True To Detail staff (admin console access). '
  'There is no self-service way to join this table — like FixNow''s single '
  'admin account, staff are added directly in the Supabase dashboard '
  '(Authentication → Users → Add user, then insert a matching row here '
  'with the service role key or the SQL editor). See README → "Create the '
  'staff account".';

alter table public.staff_users enable row level security;

-- ---------------------------------------------------------------------------
-- public.is_staff() — the one predicate every other table's RLS policies in
-- this app build on. security definer + stable so it can read staff_users
-- past RLS (staff_users itself denies ordinary authenticated select) without
-- every policy needing its own subquery/grant.
-- ---------------------------------------------------------------------------
create or replace function public.is_staff()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (select 1 from public.staff_users where id = auth.uid());
$$;

comment on function public.is_staff() is
  'True if the current authenticated user is True To Detail staff. Used '
  'throughout this app''s RLS policies in place of a per-table admin check.';

-- customers: a customer can read/update their own row; staff can read/update
-- any row (customer support, correcting a typo'd phone number, etc). Nobody
-- can insert directly — rows are created only by handle_new_user() below,
-- which runs as security definer and bypasses RLS.
drop policy if exists "Customers read own row" on public.customers;
create policy "Customers read own row"
  on public.customers for select
  to authenticated
  using (id = auth.uid() or public.is_staff());

drop policy if exists "Customers update own row" on public.customers;
create policy "Customers update own row"
  on public.customers for update
  to authenticated
  using (id = auth.uid() or public.is_staff())
  with check (id = auth.uid() or public.is_staff());

revoke all on public.customers from anon, public;
grant select, update on public.customers to authenticated;

-- staff_users: staff can read the roster (so the admin console can show
-- "assigned to"); nobody can write to it from the app — see the comment
-- above on how staff accounts are actually created.
drop policy if exists "Staff read roster" on public.staff_users;
create policy "Staff read roster"
  on public.staff_users for select
  to authenticated
  using (public.is_staff());

revoke all on public.staff_users from anon, public;
grant select on public.staff_users to authenticated;

-- ---------------------------------------------------------------------------
-- Auto-create a customer profile the moment someone signs up. Every new
-- Supabase Auth user starts life as a customer; staff status is a separate,
-- manually-granted upgrade (inserting into staff_users), never automatic.
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.customers (id, first_name, last_name, email, phone)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'first_name', split_part(coalesce(new.email, ''), '@', 1)),
    new.raw_user_meta_data ->> 'last_name',
    new.email,
    new.raw_user_meta_data ->> 'phone'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
