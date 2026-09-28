import { createFileRoute, redirect } from "@tanstack/react-router";

/**
 * This app has no marketing/landing page of its own — that's
 * truetodetail.co.uk's job. Anyone who lands on "/" (a bookmark, a stray
 * link, the bare app domain) goes straight to sign-in; /account/login
 * itself redirects on to /account the moment it sees an existing session
 * (including one shared in via cross-site SSO — see lib/supabase.ts), so a
 * signed-in visitor never actually sees a login form here either.
 */
export const Route = createFileRoute("/")({
  beforeLoad: () => {
    throw redirect({ to: "/account/login" });
  },
});
