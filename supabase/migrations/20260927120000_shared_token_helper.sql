-- True To Detail Job System — shared helper used by every persistent,
-- unauthenticated link this app issues (currently just the detailer link).
--
-- Same shape as FixNow Mechanics Tracking's generate_tracking_token(): 9
-- random bytes, base64url-encoded, ~72 bits of entropy — short enough for a
-- bookmarked link, long enough to be unguessable. Detailers hold this
-- indefinitely (it's not per-job), so treat it like a password.

create or replace function public.generate_link_token()
returns text
language sql
volatile
as $$
  select translate(encode(gen_random_bytes(9), 'base64'), '+/=', '-_');
$$;

comment on function public.generate_link_token() is
  'Short (12 char), URL-safe, ~72-bit random token for persistent staff-facing links (detailers).';
