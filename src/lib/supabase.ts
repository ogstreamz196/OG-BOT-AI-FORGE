import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Supabase client for the OG-BOT studio backend.
 *
 * The URL and publishable (anon) key are public by design and injected at
 * build time via Vite env (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY). When
 * they are absent — e.g. the test runner, or a fully air-gapped build — the
 * client is null and every store falls back to local-only operation, so the
 * studio keeps working offline.
 */
const url = import.meta.env["VITE_SUPABASE_URL"] as string | undefined;
const key = import.meta.env["VITE_SUPABASE_ANON_KEY"] as string | undefined;

const browser = typeof window !== "undefined";
export const supabase: SupabaseClient | null =
  url && key
    ? createClient(url, key, {
        // Persist the auth session in the browser so Google DEV sign-in survives
        // reloads and OAuth redirects resolve; inert during SSR.
        auth: { persistSession: browser, autoRefreshToken: browser, detectSessionInUrl: browser },
      })
    : null;

export const hasSupabase = Boolean(supabase);
