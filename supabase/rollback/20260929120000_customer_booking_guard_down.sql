-- Rollback for 20260929120000_customer_booking_guard.sql. Restores the
-- function bodies exactly as they were in production before it was applied
-- (captured with pg_get_functiondef on 2026-09-29) and removes what it
-- added. Run in the Supabase SQL editor only if the migration must be undone.

drop trigger if exists guard_customer_booking on public.bookings;
drop function if exists public.guard_customer_booking();

drop trigger if exists on_auth_user_confirmed on auth.users;
drop function if exists public.handle_user_confirmed();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_existing_id uuid;
begin
  select id into v_existing_id
  from public.customers
  where auth_user_id is null
    and email is not null
    and lower(email) = lower(coalesce(new.email, ''))
  limit 1;

  if v_existing_id is not null then
    update public.customers
    set auth_user_id = new.id,
        first_name = coalesce(new.raw_user_meta_data ->> 'first_name', first_name),
        last_name = coalesce(new.raw_user_meta_data ->> 'last_name', last_name),
        phone = coalesce(new.raw_user_meta_data ->> 'phone', phone)
    where id = v_existing_id;
  else
    insert into public.customers (auth_user_id, first_name, last_name, email, phone)
    values (
      new.id,
      coalesce(new.raw_user_meta_data ->> 'first_name', split_part(coalesce(new.email, ''), '@', 1)),
      new.raw_user_meta_data ->> 'last_name',
      new.email,
      new.raw_user_meta_data ->> 'phone'
    )
    on conflict (auth_user_id) do nothing;
  end if;

  return new;
end;
$function$;

drop function if exists public.claim_or_create_customer(uuid, text, jsonb, boolean);

create or replace function public.cancel_own_booking(p_booking_id uuid, p_reason text default 'Customer cancelled'::text)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  update public.bookings
  set status = 'cancelled',
      cancelled_at = now(),
      cancellation_reason = p_reason
  where id = p_booking_id
    and customer_id = public.my_customer_id()
    and status = 'confirmed';

  if not found then
    raise exception 'Booking not found, not yours, or can no longer be cancelled online — call us instead.';
  end if;
end;
$function$;

update storage.buckets set allowed_mime_types = null, file_size_limit = null where id = 'check-in-photos';

drop function if exists public.detail_package_list();
drop function if exists public.detail_addon_list();
