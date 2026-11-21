import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function Panel({ title, right, children, className }: { title: string; right?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cn("og-glass og-hairline flex flex-col rounded-2xl shadow-xl shadow-black/25", className)}>
      <header className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-b border-border/60 px-4 py-2.5">
        <h3 className="min-w-0 font-display text-base uppercase tracking-wide text-foreground">{title}</h3>
        {right && <div className="ml-auto flex min-w-0 items-center">{right}</div>}
      </header>
      <div className="min-h-0 flex-1 p-4">{children}</div>
    </section>
  );
}

export function Btn({ children, onClick, variant = "primary", disabled, className, title }: { children: ReactNode; onClick?: () => void; variant?: "primary" | "blue" | "ghost" | "danger"; disabled?: boolean; className?: string; title?: string | undefined }) {
  const v = {
    primary: "og-gradient text-primary-foreground shadow-md shadow-primary/25 hover:brightness-110",
    blue: "bg-secondary text-secondary-foreground shadow-md shadow-secondary/20 hover:brightness-110",
    ghost: "border border-border/80 bg-background/40 text-foreground hover:border-primary hover:bg-primary/10 hover:text-foreground",
    danger: "bg-destructive text-destructive-foreground hover:brightness-110",
  }[variant];
  return (
    <button
      disabled={disabled}
      onClick={onClick}
      title={title}
      className={cn(
        "rounded-xl px-4 py-2 text-xs font-bold uppercase tracking-wide transition active:scale-[0.98] disabled:pointer-events-none disabled:opacity-40 disabled:shadow-none",
        v,
        className,
      )}
    >
      {children}
    </button>
  );
}

export function Bar({ value, tone = "primary" }: { value: number; tone?: "primary" | "secondary" | "warning" | "destructive" }) {
  const c = { primary: "og-gradient", secondary: "bg-secondary", warning: "bg-warning", destructive: "bg-destructive" }[tone];
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
      <div className={cn("h-full transition-all duration-500", c)} style={{ width: `${Math.min(100, Math.max(0, value))}%` }} />
    </div>
  );
}

export function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="og-hairline min-w-0 rounded-xl bg-card/60 p-3">
      <div className="truncate font-mono text-[10px] uppercase tracking-widest text-muted-foreground">{label}</div>
      <div className="mt-1 truncate font-display text-2xl tabular-nums text-foreground">{value}</div>
      {sub && <div className="text-xs text-muted-foreground">{sub}</div>}
    </div>
  );
}

export const inputCls =
  "w-full rounded-lg border border-input bg-background/60 px-3 py-2 text-[13px] text-foreground outline-none transition placeholder:text-muted-foreground/70 focus:border-primary focus:ring-2 focus:ring-primary/25";
