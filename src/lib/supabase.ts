import { createBrowserClient } from "@supabase/ssr";

export const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
export const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

/**
 * Cross-subdomain single sign-on: the main marketing site (truetodetail.co.uk)
 * and this app (app.truetodetail.co.uk) share ONE Supabase project and read/
 * write the SAME session cookie, scoped to the parent domain. Set this to
 * ".truetodetail.co.uk" (note the leading dot) once both are deployed under
 * that domain — see README → "Cross-site login (SSO)". Left unset, the
 * session cookie is scoped to whatever host the app is actually running on
 * (correct behaviour for local dev / preview deploys, just not shared).
 */
export const authCookieDomain = import.meta.env.VITE_AUTH_COOKIE_DOMAIN as string | undefined;

/** False when the app hasn't been configured with a Supabase project yet. */
export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

if (!isSupabaseConfigured && typeof window !== "undefined") {
  console.warn(
    "[True To Detail] Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY. Copy .env.example to " +
      ".env.local and fill them in. See the README for setup steps.",
  );
}

// createBrowserClient (not supabase-js's plain createClient) stores the
// session in a cookie instead of localStorage — the same mechanism the main
// site's lib/supabaseBrowser.ts uses to read it, which is what makes signing
// in here visible over there. Safe to construct during SSR too: cookie
// access only happens lazily on an actual auth call, and this app never does
// blocking server-side data loads (every query runs client-side, post-
// hydration, via react-query), so there's nothing for it to read on the
// server today regardless.
export const supabase = createBrowserClient(
  supabaseUrl || "https://placeholder.supabase.co",
  supabaseAnonKey || "public-anon-key",
  {
    cookieOptions: {
      ...(authCookieDomain ? { domain: authCookieDomain } : {}),
      path: "/",
      sameSite: "lax",
      secure: true,
    },
  },
);
