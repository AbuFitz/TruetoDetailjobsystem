-- Finishing a job no longer makes the detailer tick every item first. The four
-- ticks stay as an optional progress view for the customer; finishing marks
-- anything still open as done. One tap instead of five.
create or replace function public.detailer_finish_job(
  p_token text, p_booking_id uuid, p_customer_name text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_detailer_id uuid := public.resolve_detailer_id(p_token);
begin
  if v_detailer_id is null then
    raise exception 'Invalid or inactive detailer link';
  end if;

  if not exists (
    select 1 from public.bookings
    where id = p_booking_id and assigned_detailer_id = v_detailer_id
      and status in ('in_progress', 'qc', 'handover')
  ) then
    raise exception 'Job not found, not assigned to you, or not in progress';
  end if;

  update public.booking_stage_progress
  set completed_at = now()
  where booking_id = p_booking_id and completed_at is null;

  if nullif(trim(coalesce(p_customer_name, '')), '') is not null then
    update public.check_ins
    set customer_ack_at = now(), customer_ack_name = left(trim(p_customer_name), 100)
    where booking_id = p_booking_id;
  end if;

  update public.bookings
  set status = 'completed', completed_at = now(), qc_at = coalesce(qc_at, now()), handover_at = coalesce(handover_at, now())
  where id = p_booking_id;
end;
$$;
revoke all on function public.detailer_finish_job(text, uuid, text) from public;
grant execute on function public.detailer_finish_job(text, uuid, text) to anon, authenticated;
