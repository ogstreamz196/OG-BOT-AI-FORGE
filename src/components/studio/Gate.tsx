import type { ReactNode } from "react";
import { Lock } from "lucide-react";
import { FEATURES, isLive, isUnlocked, license, TIER_LABEL, useLicense } from "@/lib/licensing";

/**
 * Section-gating middleware. Wraps a tab's content and renders it only when
 * the current license unlocks that feature and the studio is live (USB
 * present or within the offline grace window). Otherwise shows a lock card.
 */
export function Gate({ feature, children }: { feature: string; children: ReactNode }) {
  const lic = useLicense();
  const f = FEATURES.find((x) => x.id === feature);
  const live = isLive(lic);
  const unlocked = isUnlocked(feature, lic);

  if (live && unlocked) return <>{children}</>;

  const reason = !live
    ? lic.plugged
      ? lic.activated
        ? "This licence has expired."
        : "Studio locked — activate your licence in the Sentinel tab."
      : "USB Sentinel key not detected and the offline grace period has ended."
    : `${f?.label ?? "This module"} is not included in your ${TIER_LABEL[lic.tier]} plan.`;

  return (
    <div className="flex min-h-[320px] items-center justify-center p-6">
      <div className="max-w-md rounded-2xl border border-border bg-panel/80 p-8 text-center backdrop-blur">
        <div className="mx-auto mb-4 w-fit rounded-full border-2 border-secondary/60 p-4 text-secondary">
          <Lock className="h-8 w-8" />
        </div>
        <h3 className="font-display text-xl uppercase text-foreground">{f?.label ?? "Locked"}</h3>
        <p className="mt-2 text-sm text-muted-foreground">{reason}</p>
        {live && !unlocked && f && (
          <button
            onClick={() => license.cycleOverride(feature)}
            className="mt-5 rounded-lg bg-primary px-4 py-2 text-xs font-bold uppercase tracking-wide text-primary-foreground transition hover:opacity-90"
          >
            Unlock in Developer Dashboard
          </button>
        )}
        {live && !unlocked && f && (
          <p className="mt-3 text-[11px] text-muted-foreground">
            Requires the {TIER_LABEL[f.minTier]} tier or a feature grant.
          </p>
        )}
      </div>
    </div>
  );
}
