import { useEffect, useState, type ReactNode } from "react";
import type { User } from "@supabase/supabase-js";
import { fetchLevel, hub, isDevLevel, signInWithGoogle, type Level } from "@/lib/auth";
import { Btn } from "./ui";
import logoAsset from "@/assets/og-bot-logo.webp.asset.json";

type Gate =
  | { s: "loading" }
  | { s: "signedOut"; error?: string }
  | { s: "checking"; user: User }
  | { s: "denied"; user: User; level: Level | null; error?: string }
  | { s: "dev"; user: User };

export type DevSession = { email: string; signOut: () => Promise<void> };

/** Shows the studio only to D.EV accounts signed in with the same Google sign-in as OG VAULT. */
export function DevGate({ children }: { children: (session: DevSession) => ReactNode }) {
  const [gate, setGate] = useState<Gate>({ s: "loading" });

  useEffect(() => {
    let alive = true;
    const check = async (user: User | null) => {
      if (!alive) return;
      if (!user) return setGate({ s: "signedOut" });
      setGate({ s: "checking", user });
      try {
        const level = await fetchLevel(user.id);
        if (alive) setGate(isDevLevel(level) ? { s: "dev", user } : { s: "denied", user, level });
      } catch (e) {
        if (alive) setGate({ s: "denied", user, level: null, error: e instanceof Error ? e.message : String(e) });
      }
    };
    const auth = hub().auth;
    auth.getSession().then(({ data }) => check(data.session?.user ?? null));
    const { data: sub } = auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_IN" || event === "SIGNED_OUT") void check(session?.user ?? null);
    });
    return () => {
      alive = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const signOut = async () => {
    await hub().auth.signOut();
    setGate({ s: "signedOut" });
  };
  const google = async () => {
    const { error } = await signInWithGoogle();
    if (error) setGate({ s: "signedOut", error: error.message || "Google sign-in failed" });
  };

  if (gate.s === "dev") return <>{children({ email: gate.user.email ?? "", signOut })}</>;

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-sm space-y-4 rounded-2xl border border-border bg-panel/90 p-6 text-center">
        <img src={logoAsset.url} alt="OG BOT logo" className="mx-auto h-20 w-20 object-contain" />
        <div>
          <div className="font-display text-2xl text-foreground">OG BOT STUDIO</div>
          <div className="mt-1 text-[10px] font-semibold uppercase tracking-[0.25em] text-muted-foreground">D.EV sign-in</div>
        </div>

        {(gate.s === "loading" || gate.s === "checking") && <p className="animate-pulse text-sm text-muted-foreground">Checking access…</p>}

        {gate.s === "signedOut" && (
          <>
            <p className="text-sm text-muted-foreground">Sign in with the same Google account you use for D.EV MODE in OG VAULT.</p>
            <Btn onClick={() => void google()} className="w-full">Sign in with Google</Btn>
            {gate.error && <p role="alert" className="text-xs text-destructive">{gate.error}</p>}
          </>
        )}

        {gate.s === "denied" && (
          <>
            <p role="alert" className="text-sm text-destructive">
              {gate.error ? `Couldn't check your access: ${gate.error}` : `${gate.user.email ?? "This account"} doesn't have D.EV access.`}
            </p>
            <Btn variant="ghost" onClick={() => void signOut()} className="w-full">Use another account</Btn>
          </>
        )}
      </div>
    </div>
  );
}
