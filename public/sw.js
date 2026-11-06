// OG-BOT PWA service worker: makes the builder installable and work offline.
// Only same-origin GETs are touched — calls to localhost engines (Ollama/ComfyUI)
// and to Supabase stay untouched so local AI keeps working offline.
const CACHE = "ogbot-v1";

self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (e) => {
  e.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // leave cross-origin (local AI, APIs) alone

  if (req.mode === "navigate") {
    e.respondWith(
      (async () => {
        try {
          const net = await fetch(req);
          const c = await caches.open(CACHE);
          c.put("/", net.clone());
          return net;
        } catch {
          const c = await caches.open(CACHE);
          return (await c.match("/")) || (await c.match(req)) || Response.error();
        }
      })(),
    );
    return;
  }

  e.respondWith(
    (async () => {
      const c = await caches.open(CACHE);
      const cached = await c.match(req);
      const fetching = fetch(req)
        .then((res) => {
          if (res.ok) c.put(req, res.clone());
          return res;
        })
        .catch(() => cached);
      return cached || fetching;
    })(),
  );
});
