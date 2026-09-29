-- Rollback for 20260929130000_database_advisor_fixes.sql.
alter function public.generate_booking_reference() reset search_path;
alter function public.generate_link_token() reset search_path;
grant execute on function public.handle_new_user() to public;
drop index if exists public.bookings_vehicle_id_idx;
drop index if exists public.bookings_address_id_idx;
-- detail_*_list, guard_customer_booking and handle_user_confirmed are
-- removed entirely by the customer_booking_guard rollback, if that is run.
