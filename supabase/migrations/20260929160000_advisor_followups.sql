-- Advisor follow-ups for the workflow migrations. No behaviour change.
alter function public._booking_email_ready(public.bookings, text) set search_path = public;

-- The pending-password table is only ever read by security definer functions.
-- An explicit "no direct access" policy says so (and quiets the linter).
drop policy if exists "No direct access" on public.pending_password_changes;
create policy "No direct access"
  on public.pending_password_changes
  for all
  to anon, authenticated
  using (false)
  with check (false);
