import { ShieldCheck, AlertTriangle } from "lucide-react";
import { usePendingPermission } from "@/lib/permissions";
import { cn } from "@/lib/utils";

/**
 * Global approval dialog. Whenever a capability is requested and not yet granted,
 * this blocks with Allow/Deny — the user always decides before the AI acts.
 */
export function PermissionModal() {
  const pending = usePendingPermission();
  if (!pending) return null;
  const { def, resolve } = pending;
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4">
      <div className="w-full max-w-md rounded-2xl border border-border bg-panel p-6 shadow-2xl">
        <div className="mb-3 flex items-center gap-2">
          {def.danger ? (
            <AlertTriangle className="h-5 w-5 text-destructive" />
          ) : (
            <ShieldCheck className="h-5 w-5 text-primary" />
          )}
          <h2 className="font-display text-lg uppercase text-foreground">Permission needed</h2>
        </div>
        <p className="text-sm font-semibold text-foreground">{def.title}</p>
        <p className="mt-1 text-sm text-muted-foreground">{def.description}</p>
        <p className="mt-3 text-[11px] text-muted-foreground">
          You can revoke this later in Tools → Self-Improve.
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <button
            onClick={() => resolve(false)}
            className="rounded-lg border border-border px-4 py-2 text-xs font-bold uppercase tracking-wide text-foreground transition hover:border-primary"
          >
            Deny
          </button>
          <button
            onClick={() => resolve(true)}
            className={cn(
              "rounded-lg px-4 py-2 text-xs font-bold uppercase tracking-wide transition hover:opacity-90",
              def.danger
                ? "bg-destructive text-destructive-foreground"
                : "bg-primary text-primary-foreground",
            )}
          >
            Allow
          </button>
        </div>
      </div>
    </div>
  );
}
