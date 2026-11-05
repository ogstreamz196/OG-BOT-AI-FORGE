import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function Panel({ title, right, children, className }: { title: string; right?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cn("flex flex-col rounded-2xl border border-border bg-panel/80 backdrop-blur", className)}>
      <header className="flex items-center justify-between border-b border-border px-3 py-2">
        <h3 className="font-display text-base uppercase text-foreground">{title}</h3>
        {right}
      </header>
      <div className="flex-1 min-h-0 p-3">{children}</div>
    </section>
  );
}

export function Btn({ children, onClick, variant = "primary", disabled, className }: { children: ReactNode; onClick?: () => void; variant?: "primary" | "blue" | "ghost" | "danger"; disabled?: boolean; className?: string }) {
  const v = {
    primary: "bg-primary text-primary-foreground hover:glow",
    blue: "bg-secondary text-secondary-foreground hover:opacity-90",
    ghost: "border border-border text-foreground hover:border-primary hover:text-primary",
    danger: "bg-destructive text-destructive-foreground",
  }[variant];
  return (
    <button disabled={disabled} onClick={onClick} className={cn("rounded-lg px-4 py-2 text-xs font-bold uppercase tracking-wide transition disabled:opacity-40", v, className)}>
      {children}
    </button>
  );
}

export function Bar({ value, tone = "primary" }: { value: number; tone?: "primary" | "secondary" | "warning" | "destructive" }) {
  const c = { primary: "bg-primary", secondary: "bg-secondary", warning: "bg-warning", destructive: "bg-destructive" }[tone];
  return (
    <div className="h-2 w-full overflow-hidden rounded bg-muted">
      <div className={cn("h-full transition-all duration-500", c)} style={{ width: `${Math.min(100, Math.max(0, value))}%` }} />
    </div>
  );
}

export function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-3">
      <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">{label}</div>
      <div className="mt-1 font-display text-2xl text-foreground">{value}</div>
      {sub && <div className="text-xs text-muted-foreground">{sub}</div>}
    </div>
  );
}

export const inputCls = "w-full rounded border border-input bg-background px-2 py-1.5 font-mono text-xs text-foreground outline-none focus:border-primary";
