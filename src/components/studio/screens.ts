import { lazy, type ComponentType } from "react";

/** Load a named export as a lazy screen. */
function screen<T extends Record<string, unknown>, K extends keyof T>(load: () => Promise<T>, name: K) {
  return {
    load,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    C: lazy(async () => ({ default: (await load())[name] as ComponentType<any> })),
  };
}

const defs = {
  Chat: screen(() => import("./Chat"), "Chat"),
  Preview: screen(() => import("./Preview"), "Preview"),
  DevWorkbench: screen(() => import("./DevWorkbench"), "DevWorkbench"),
  Settings: screen(() => import("./Settings"), "Settings"),
  Dashboard: screen(() => import("./Dashboard"), "Dashboard"),
  Forge: screen(() => import("./Forge"), "Forge"),
  ImageGen: screen(() => import("./ImageGen"), "ImageGen"),
  Music: screen(() => import("./Music"), "Music"),
  Hardware: screen(() => import("./Hardware"), "Hardware"),
  Sentinel: screen(() => import("./Sentinel"), "Sentinel"),
  Database: screen(() => import("./Database"), "Database"),
  GitSync: screen(() => import("./GitSync"), "GitSync"),
  Connectors: screen(() => import("./Connectors"), "Connectors"),
  Brand: screen(() => import("./Brand"), "Brand"),
  OllamaTester: screen(() => import("./OllamaTester"), "OllamaTester"),
  MusicVideo: screen(() => import("./MusicVideo"), "MusicVideo"),
  SetupGuide: screen(() => import("./SetupGuide"), "SetupGuide"),
};

type Screens = { [K in keyof typeof defs]: ComponentType<any> }; // eslint-disable-line @typescript-eslint/no-explicit-any
export const screens = Object.fromEntries(Object.entries(defs).map(([k, v]) => [k, v.C])) as unknown as Screens;

/** Fetch every screen in the background once the page is idle (Build first). */
export function prefetchScreens() {
  if (typeof window === "undefined") return;
  // Respect data saver.
  const conn = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
  if (conn?.saveData) return;
  const order = ["Chat", "Preview", "Dashboard", "Settings", "SetupGuide", "ImageGen", "MusicVideo", "DevWorkbench"] as const;
  const rest = Object.keys(defs).filter((k) => !(order as readonly string[]).includes(k)) as (keyof typeof defs)[];
  const queue = [...order, ...rest];
  const idle = (fn: () => void) =>
    "requestIdleCallback" in window ? (window as Window & { requestIdleCallback: (f: () => void) => void }).requestIdleCallback(fn) : setTimeout(fn, 1500);
  let i = 0;
  const next = () => {
    const k = queue[i++];
    if (!k) return;
    defs[k].load().catch(() => {}).finally(() => idle(next));
  };
  setTimeout(() => idle(next), 2000);
}
