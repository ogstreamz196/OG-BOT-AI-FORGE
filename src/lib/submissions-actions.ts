import { createServerFn } from "@tanstack/react-start";

/**
 * Read contact-form submissions. The submissions table is INSERT-only for the
 * anon key, so reading must happen server-side with the Supabase service role
 * key — which lives ONLY on the Worker (process.env.SUPABASE_SERVICE_KEY) and
 * is never shipped to the browser. The project URL reuses the public
 * VITE_SUPABASE_URL build env.
 */

export type Submission = {
  id: string;
  project: string | null;
  name: string | null;
  email: string | null;
  message: string | null;
  created_at: string;
};

export type SubmissionsResult = { ok: boolean; rows: Submission[]; message: string };

export const getSubmissions = createServerFn({ method: "GET" }).handler(
  async (): Promise<SubmissionsResult> => {
    const url = import.meta.env["VITE_SUPABASE_URL"] as string | undefined;
    const key = process.env["SUPABASE_SERVICE_KEY"];
    if (!url || !key) {
      return {
        ok: false,
        rows: [],
        message: "Set SUPABASE_SERVICE_KEY on the Worker to view submissions.",
      };
    }
    try {
      const res = await fetch(
        `${url.replace(/\/$/, "")}/rest/v1/submissions?select=*&order=created_at.desc&limit=100`,
        { headers: { apikey: key, Authorization: `Bearer ${key}` } },
      );
      if (!res.ok) return { ok: false, rows: [], message: `Supabase ${res.status}` };
      const rows = (await res.json()) as Submission[];
      return {
        ok: true,
        rows,
        message: `${rows.length} submission${rows.length === 1 ? "" : "s"}`,
      };
    } catch (e) {
      return { ok: false, rows: [], message: e instanceof Error ? e.message : "Fetch failed" };
    }
  },
);
