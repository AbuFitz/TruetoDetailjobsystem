-- Rollback for 20260929150000_customer_accounts.sql. Accounts already created
-- keep working; only the staff tools and the forced-change prompt go away.
drop function if exists public.admin_create_customer_account(uuid, text);
drop function if exists public.admin_reset_customer_password(uuid, text);
drop function if exists public.customer_password_changed();
drop function if exists public.generate_temp_password();
drop trigger if exists customers_guard_must_change_password on public.customers;
drop function if exists public.guard_must_change_password();
drop table if exists public.pending_password_changes;
alter table public.customers drop column if exists must_change_password;
