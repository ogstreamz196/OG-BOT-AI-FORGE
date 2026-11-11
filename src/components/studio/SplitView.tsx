import { useEffect, useRef, useState, type ReactNode } from "react";
import { Columns2, Eye, MessageSquare } from "lucide-react";
import { cn } from "@/lib/utils";

export type SplitMode = "left" | "split" | "right";

/** Split is offered only when both panes get a usable width. */
export const SPLIT_MIN_WIDTH = 760;

/**
 * Two panes (e.g. Chat | Preview) with a window picker: show one, or both side by side with a
 * draggable divider. Works on any screen: Split only appears when there's room, and phones get
 * a full-width pane with the picker at the bottom. Both panes stay mounted, so switching never
 * resets the chat or reloads the preview. The choice and divider position are remembered.
 */
export function SplitView({
  id,
  left,
  right,
  leftLabel = "Chat",
  rightLabel = "Preview",
  leftIcon = MessageSquare,
  rightIcon = Eye,
  defaultMode = "split",
  narrowDefault = "right",
}: {
  id: string;
  left: ReactNode;
  right: ReactNode;
  leftLabel?: string;
  rightLabel?: string;
  leftIcon?: typeof Eye;
  rightIcon?: typeof Eye;
  defaultMode?: SplitMode;
  narrowDefault?: Exclude<SplitMode, "split">;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [mode, setMode] = useState<SplitMode>(defaultMode);
  const [pct, setPct] = useState(40);
  const drag = useRef(false);

  // Remember the choice per view (per browser).
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(`og-split-${id}`) ?? "null") as {
        mode?: SplitMode;
        pct?: number;
      } | null;
      if (saved?.mode) setMode(saved.mode);
      if (saved?.pct) setPct(Math.min(75, Math.max(25, saved.pct)));
    } catch {
      /* ignore */
    }
  }, [id]);
  const save = (m: SplitMode, p: number) => {
    try {
      localStorage.setItem(`og-split-${id}`, JSON.stringify({ mode: m, pct: p }));
    } catch {
      /* ignore */
    }
  };

  useEffect(() => {
    const el = box.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(([e]) => setWidth(e!.contentRect.width));
    ro.observe(el);
    setWidth(el.getBoundingClientRect().width);
    return () => ro.disconnect();
  }, []);

  const roomy = width === 0 || width >= SPLIT_MIN_WIDTH;
  const shown: SplitMode = mode === "split" && !roomy ? narrowDefault : mode;
  const choose = (m: SplitMode) => {
    setMode(m);
    save(m, pct);
  };

  const onMove = (clientX: number) => {
    const r = box.current?.getBoundingClientRect();
    if (!drag.current || !r) return;
    setPct(Math.min(75, Math.max(25, ((clientX - r.left) / r.width) * 100)));
  };
  const endDrag = () => {
    if (!drag.current) return;
    drag.current = false;
    document.body.style.userSelect = "";
    save(mode, pct);
  };

  const options: [SplitMode, string, typeof Eye][] = [
    ["left", leftLabel, leftIcon],
    ...(roomy ? ([["split", "Split", Columns2]] as [SplitMode, string, typeof Eye][]) : []),
    ["right", rightLabel, rightIcon],
  ];

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div
        ref={box}
        className="relative flex min-h-0 flex-1"
        onPointerMove={(e) => onMove(e.clientX)}
        onPointerUp={endDrag}
        onPointerLeave={endDrag}
      >
        <section
          aria-label={leftLabel}
          className={cn(
            "min-h-0 min-w-0 overflow-hidden",
            shown === "right" && "hidden",
            shown === "left" && "flex-1",
          )}
          style={shown === "split" ? { width: `${pct}%` } : undefined}
        >
          {left}
        </section>
        {shown === "split" && (
          <div
            role="separator"
            aria-orientation="vertical"
            aria-label="Resize panes"
            tabIndex={0}
            onPointerDown={(e) => {
              drag.current = true;
              document.body.style.userSelect = "none";
              (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
            }}
            onKeyDown={(e) => {
              if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
                const p = Math.min(75, Math.max(25, pct + (e.key === "ArrowLeft" ? -5 : 5)));
                setPct(p);
                save(mode, p);
              }
            }}
            className="group relative w-2 shrink-0 cursor-col-resize touch-none bg-gradient-to-b from-transparent via-border/80 to-transparent transition hover:via-primary focus:via-primary focus:outline-none"
          >
            <span
              aria-hidden
              className="pointer-events-none absolute left-1/2 top-1/2 flex h-10 w-3 -translate-x-1/2 -translate-y-1/2 flex-col items-center justify-center gap-1 rounded-full border border-border bg-panel shadow-lg transition group-hover:border-primary group-focus:border-primary"
            >
              <i className="h-0.5 w-0.5 rounded-full bg-muted-foreground" />
              <i className="h-0.5 w-0.5 rounded-full bg-muted-foreground" />
              <i className="h-0.5 w-0.5 rounded-full bg-muted-foreground" />
            </span>
          </div>
        )}
        <section
          aria-label={rightLabel}
          className={cn("min-h-0 min-w-0 flex-1 overflow-hidden", shown === "left" && "hidden")}
        >
          {right}
        </section>
      </div>
      <div className="og-glass flex shrink-0 justify-center border-t border-border/60 px-3 py-2">
        <div
          role="tablist"
          aria-label="Window"
          className="og-hairline flex w-full max-w-md gap-1 rounded-full bg-background/40 p-1"
        >
          {options.map(([m, label, Icon]) => (
            <button
              key={m}
              role="tab"
              aria-selected={shown === m}
              onClick={() => choose(m)}
              className={cn(
                "flex flex-1 items-center justify-center gap-2 rounded-full py-1.5 text-xs font-semibold uppercase tracking-wider transition",
                shown === m
                  ? "og-gradient text-primary-foreground shadow-md shadow-primary/30"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <Icon className="h-4 w-4" /> {label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
