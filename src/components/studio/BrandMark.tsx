/** OGSTREAMZ presentz OFFLINE FORGE — the app's wordmark. OG BOT is the assistant that powers it. */
export const APP_NAME = "OFFLINE FORGE";
export const APP_PRESENTER = "OGSTREAMZ presentz";
export const APP_TITLE = `${APP_PRESENTER} ${APP_NAME}`;

export function BrandMark({ size = "sm" }: { size?: "sm" | "lg" }) {
  const big = size === "lg";
  return (
    <div className="leading-none" title={`${APP_TITLE} · powered by OG BOT`}>
      <div
        className={`font-display uppercase tracking-[0.18em] text-presentz ${big ? "text-sm" : "text-[8px]"}`}
      >
        OGSTREAMZ presentz
      </div>
      <div className={`font-display uppercase text-chrome ${big ? "text-4xl" : "text-lg"}`}>
        {APP_NAME}
      </div>
      <div
        className={`font-mono uppercase tracking-widest text-muted-foreground ${big ? "mt-1 text-[11px]" : "hidden text-[7px] lg:block"}`}
      >
        powered by <span className="text-primary">OG BOT</span>
      </div>
    </div>
  );
}
