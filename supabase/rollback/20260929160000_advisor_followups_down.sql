-- Rollback for 20260929160000_advisor_followups.sql.
drop policy if exists "No direct access" on public.pending_password_changes;
alter function public._booking_email_ready(public.bookings, text) reset search_path;
