/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_ANON_KEY?: string;
  /** Cross-subdomain SSO cookie domain — see .env.example and lib/supabase.ts. */
  readonly VITE_AUTH_COOKIE_DOMAIN?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
