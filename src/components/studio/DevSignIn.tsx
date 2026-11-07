import { useState } from "react";
import { ShieldCheck, X, Wifi, WifiOff } from "lucide-react";
import { devAuth, DEV_ROLE } from "@/lib/dev-auth";
import { useOnline } from "@/lib/online";

/**
 * Discreet DEV sign-in sheet. Opened from a hidden gesture (tap the logo a few
 * times, or Ctrl/Cmd+Shift+D). Offers Google sign-in and a local fallback code.
 */
export function DevSignIn({ onClose }: { onClose: () => void }) {
  const [code, setCode] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const online = useOnline();

  const google = async () => {
    setBusy(true);
    setMsg(null);
    const r = await devAuth.signIn();
    setMsg(r.message);
    setBusy(false);
  };

  const local = () => {
    if (devAuth.unlockWithCode(code)) {
      onClose();
    } else {
      setMsg("Invalid code.");
    }
  };

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/80 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-2xl border border-border bg-panel p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <span className="flex items-center gap-2 font-display text-lg uppercase text-foreground">
            <ShieldCheck className="h-5 w-5 text-primary" /> {DEV_ROLE}
          </span>
          <button
            onClick={onClose}
            aria-label="Close"
            className="text-muted-foreground hover:text-foreground"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div
          className={`mb-3 flex items-center gap-2 rounded-lg border px-3 py-2 text-xs ${online ? "border-primary/40 bg-primary/10 text-primary" : "border-border bg-card text-muted-foreground"}`}
        >
          {online ? <Wifi className="h-4 w-4" /> : <WifiOff className="h-4 w-4" />}
          {online
            ? "Online — remote dev access on any device, anywhere."
            : "Offline — use the local dev code below."}
        </div>

        <button
          onClick={() => void google()}
          disabled={busy || !online}
          title={online ? "" : "Sign in requires an internet connection"}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-white px-4 py-2.5 text-sm font-bold text-[#1f1f1f] transition hover:opacity-90 disabled:opacity-50"
        >
          <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden>
            <path
              fill="#EA4335"
              d="M24 9.5c3.5 0 6.6 1.2 9 3.6l6.7-6.7C35.6 2.7 30.1 0 24 0 14.6 0 6.4 5.4 2.5 13.3l7.8 6c1.9-5.6 7.1-9.8 13.7-9.8z"
            />
            <path
              fill="#4285F4"
              d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.5 3-2.2 5.5-4.7 7.2l7.3 5.7c4.3-3.9 6.8-9.7 6.8-17.4z"
            />
            <path
              fill="#FBBC05"
              d="M10.3 28.3c-.5-1.4-.8-2.9-.8-4.3s.3-3 .8-4.3l-7.8-6C.9 16.9 0 20.3 0 24s.9 7.1 2.5 10.3l7.8-6z"
            />
            <path
              fill="#34A853"
              d="M24 48c6.1 0 11.3-2 15-5.5l-7.3-5.7c-2 1.4-4.7 2.3-7.7 2.3-6.6 0-11.8-4.2-13.7-9.8l-7.8 6C6.4 42.6 14.6 48 24 48z"
            />
          </svg>
          Sign in with Google
        </button>

        <div className="my-3 flex items-center gap-3 text-[11px] text-muted-foreground">
          <span className="h-px flex-1 bg-border" /> or local fallback{" "}
          <span className="h-px flex-1 bg-border" />
        </div>

        <div className="flex gap-2">
          <input
            type="password"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && local()}
            placeholder="dev code"
            className="w-full rounded border border-input bg-background px-3 py-2 font-mono text-xs text-foreground outline-none focus:border-primary"
          />
          <button
            onClick={local}
            className="rounded-lg bg-primary px-4 py-2 text-xs font-bold uppercase text-primary-foreground hover:opacity-90"
          >
            Unlock
          </button>
        </div>

        {msg && <p className="mt-3 text-xs text-muted-foreground">{msg}</p>}
      </div>
    </div>
  );
}
