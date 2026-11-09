// Sign-in shared with OG VAULT: same OGSTREAMZ HUB Supabase project, same Google
// sign-in, same access levels. Only D.EV accounts (level "admin") may open the studio.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Public values (the publishable key is meant for browser code; data is protected by
// row-level security in the hub). Same as OG VAULT's src/integrations/supabase/client.ts.
const HUB_URL = "https://zqwngcndkxgxuwqyxihi.supabase.co";
const HUB_PUBLISHABLE_KEY = "sb_publishable_dw2_Tej-Knf0iH5U4KUcSg_65f7XPJC";

/** Mirrors OG VAULT's src/lib/access.ts. */
export type Level = "none" | "guest" | "free" | "vip" | "staff" | "admin";
export const DEV_EMAILS = ["ogstreamz196@gmail.com", "ogbot196@gmail.com"] as const;

/** D.EV access = the vault's admin level (granted to DEV_EMAILS by the hub). */
export function isDevLevel(level: Level | null | undefined): boolean {
  return level === "admin";
}

let client: SupabaseClient | null = null;
/** Browser-only client (the server render never signs anyone in). */
export function hub(): SupabaseClient {
  client ??= createClient(HUB_URL, HUB_PUBLISHABLE_KEY, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, storageKey: "ogbot-studio-auth" },
  });
  return client;
}

export async function signInWithGoogle() {
  return hub().auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: window.location.origin, queryParams: { prompt: "select_account" } },
  });
}

export async function fetchLevel(userId: string): Promise<Level> {
  const { data, error } = await hub().rpc("user_level", { _user_id: userId });
  if (error) throw error;
  return ((data as string | null) ?? "guest") as Level;
}
