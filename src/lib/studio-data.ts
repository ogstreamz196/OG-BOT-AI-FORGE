// The studio's saved licence and usage counters, in the AI FORGE OFFLINE Supabase
// project (tables `licenses` and `usage_ledger`, one row each with id "primary").
// Row-level security lets only the D.EV accounts read or change them.
import { supabase } from "./auth";

export type Slot = { slot: number; label: string; mac: string | null };
export type License = {
  id: string;
  customer: string;
  tier: "starter" | "pro" | "enterprise";
  expires: string;
  slots: Slot[];
  device_key: string;
  usb_serial: string;
  plugged: boolean;
  activated: boolean;
  grace_days_left: number;
};
export type UsageField = "prompts" | "edits" | "images" | "music" | "builds";
export type Usage = Record<UsageField, number> & { since: string };

const ROW = "primary";

export async function loadLicense(): Promise<License | null> {
  const { data, error } = await supabase().from("licenses").select("*").eq("id", ROW).maybeSingle();
  if (error) throw error;
  return data as License | null;
}

export async function saveLicense(patch: Partial<Omit<License, "id">>): Promise<void> {
  const { error } = await supabase().from("licenses").update(patch).eq("id", ROW);
  if (error) throw error;
}

export async function loadUsage(): Promise<Usage | null> {
  const { data, error } = await supabase().from("usage_ledger").select("prompts,edits,images,music,builds,since").eq("id", ROW).maybeSingle();
  if (error) throw error;
  return data as Usage | null;
}

/** Adds 1 to a usage counter. Never throws: a failed count must not break the tool using it. */
export async function bumpUsage(field: UsageField): Promise<void> {
  if (typeof window === "undefined" || import.meta.env.MODE === "test") return;
  try {
    const { data } = await supabase().from("usage_ledger").select(field).eq("id", ROW).maybeSingle();
    const current = (data as Record<string, number> | null)?.[field];
    if (typeof current !== "number") return;
    await supabase().from("usage_ledger").update({ [field]: current + 1 }).eq("id", ROW);
  } catch {
    /* offline or not signed in: skip counting */
  }
}
