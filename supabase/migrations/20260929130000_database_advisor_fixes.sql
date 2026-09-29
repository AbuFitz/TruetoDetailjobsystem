-- Follow-ups from the Supabase database advisor after the booking guard
-- migration. No behaviour changes.

-- Pin search paths so these functions can't be pointed at other objects.
-- pgcrypto (gen_random_bytes) lives in the extensions schema on Supabase.
alter function public.generate_booking_reference() set search_path = public, extensions;
alter function public.generate_link_token() set search_path = public, extensions;
alter function public.detail_package_list() set search_path = '';
alter function public.detail_addon_list() set search_path = '';

-- Trigger functions only ever run as triggers; nobody needs to call them
-- through the API. Revoking EXECUTE doesn't stop the triggers firing.
revoke execute on function public.guard_customer_booking() from public, anon, authenticated;
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.handle_user_confirmed() from public, anon, authenticated;

-- Foreign keys used when a saved vehicle or address is looked up or removed.
create index if not exists bookings_vehicle_id_idx on public.bookings (vehicle_id);
create index if not exists bookings_address_id_idx on public.bookings (address_id);
