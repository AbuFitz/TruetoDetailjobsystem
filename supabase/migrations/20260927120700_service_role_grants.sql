-- True To Detail Job System — explicit service_role grants.
--
-- BYPASSRLS only skips row security *policies* — it does not grant ordinary
-- SQL table privileges (confirmed the hard way in FixNow Mechanics
-- Tracking's history — see its AGENTS.md). The get-eta Edge Function
-- connects as service_role to read live positions/destinations for the
-- real, routing-based ETA — without this grant it 403s exactly like
-- push_subscriptions and tracking_sessions did there.

grant select on public.bookings to service_role;
