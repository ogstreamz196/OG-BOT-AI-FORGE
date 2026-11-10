// D.EV sign-in for the studio: Google via the AI FORGE OFFLINE Supabase project.
// Only the D.EV Google accounts may open the studio.
import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";

// Public values: the publishable key is meant for browser code.
const SUPABASE_URL = "https://hukxeaewihywbkstkgyf.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_bODYUbyzyXONVaERogULBw_-_6nfdrq";

/** D.EV accounts (same two as OG VAULT's D.EV MODE). */
export const DEV_EMAILS = ["ogstreamz196@gmail.com", "ogbot196@gmail.com"] as const;

/** A D.EV user signed in with Google using one of DEV_EMAILS. */
export function isDevUser(user: Pick<User, "email" | "app_metadata"> | null | undefined): boolean {
  const email = user?.email?.trim().toLowerCase();
  const viaGoogle = user?.app_metadata?.["providers"]?.includes?.("google") || user?.app_metadata?.["provider"] === "google";
  return !!email && !!viaGoogle && (DEV_EMAILS as readonly string[]).includes(email);
}

let client: SupabaseClient | null = null;
/** Browser-only client (the server render never signs anyone in). */
export function supabase(): SupabaseClient {
  client ??= createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, storageKey: "ogbot-studio-auth" },
  });
  return client;
}

export async function signInWithGoogle() {
  return supabase().auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: window.location.origin, queryParams: { prompt: "select_account" } },
  });
}
