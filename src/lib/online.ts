import { useSyncExternalStore } from "react";

/**
 * Online/offline detection. When online, remote DEV access via Google works on
 * any device; when offline, the local fallback code is used. Reflects the
 * browser's connectivity (navigator.onLine + online/offline events).
 */
function subscribe(cb: () => void) {
  if (typeof window === "undefined") return () => {};
  window.addEventListener("online", cb);
  window.addEventListener("offline", cb);
  return () => {
    window.removeEventListener("online", cb);
    window.removeEventListener("offline", cb);
  };
}

export function useOnline(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => (typeof navigator === "undefined" ? true : navigator.onLine),
    () => true,
  );
}
