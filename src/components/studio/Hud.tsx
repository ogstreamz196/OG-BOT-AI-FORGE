import { useState } from "react";
import { ChevronDown, Cpu, ShieldCheck, ShieldAlert, Usb } from "lucide-react";
import { isLive, TIER_LABEL, useLicense } from "@/lib/licensing";
import { usage, useUsage } from "@/lib/usage";
import { cn } from "@/lib/utils";

/**
 * Always-visible status HUD: a collapsible drawer pinned to the bottom-right
 * that surfaces the host device key / MAC, licence tier and state, offline
 * grace and total activity, on every tab.
 */
export function Hud() {
  const lic = useLicense();
  const u = useUsage();
  const [open, setOpen] = useState(false);
  const live = isLive(lic);

  return (
    <div className="fixed bottom-3 right-3 z-50 w-[min(92vw,320px)] font-mono text-xs">
      <div className="overflow-hidden rounded-2xl border border-white/10 bg-black/70 shadow-xl backdrop-blur-md">
        <button
          onClick={() => setOpen((o) => !o)}
          className="flex w-full items-center justify-between gap-2 px-3 py-2"
          aria-expanded={open}
        >
          <span className="flex items-center gap-2">
            {live ? (
              <ShieldCheck className="h-4 w-4 text-primary" />
            ) : (
              <ShieldAlert className="h-4 w-4 text-destructive" />
            )}
            <span className={live ? "font-bold text-primary" : "font-bold text-destructive"}>
              {live ? "LIVE" : "LOCKED"}
            </span>
            <span className="text-muted-foreground">· {TIER_LABEL[lic.tier]}</span>
          </span>
          <ChevronDown
            className={cn("h-4 w-4 text-muted-foreground transition", open && "rotate-180")}
          />
        </button>

        {open && (
          <dl className="space-y-1.5 border-t border-white/10 px-3 py-2">
            {(
              [
                ["Device Key", lic.deviceKey],
                ["Host MAC", lic.mac],
                [
                  "USB",
                  lic.plugged
                    ? `present · grace ${lic.graceDaysLeft}d`
                    : `ejected · grace ${lic.graceDaysLeft}d`,
                ],
                ["Expires", lic.expires],
              ] as const
            ).map(([k, v]) => (
              <div key={k} className="flex items-center justify-between gap-2">
                <dt className="text-[10px] uppercase tracking-widest text-muted-foreground">{k}</dt>
                <dd className="truncate text-foreground" title={v}>
                  {v}
                </dd>
              </div>
            ))}
            <div className="flex items-center justify-between gap-2 border-t border-white/10 pt-1.5 text-muted-foreground">
              <span className="flex items-center gap-1">
                <Usb className="h-3 w-3" />
                {lic.slots.filter((s) => s.mac).length}/{lic.slots.length} slots
              </span>
              <span className="flex items-center gap-1">
                <Cpu className="h-3 w-3" />
                {usage.total()} actions
              </span>
            </div>
            <div className="pt-0.5 text-[10px] text-muted-foreground">Ledger since {u.since}</div>
          </dl>
        )}
      </div>
    </div>
  );
}
