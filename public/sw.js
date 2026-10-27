const CACHE_NAME = "koinonia-v5";
const STATIC_ASSETS = [
  "/",
  "/accueil",
];

// Install: cache static assets
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

// Activate: clean old caches
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

// Fetch: network-first for API, cache-first for static
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // Skip non-GET requests
  if (event.request.method !== "GET") return;

  // API routes: network only (don't cache)
  if (url.pathname.startsWith("/api/")) return;

  // Next.js internal routes: network only
  if (url.pathname.startsWith("/_next/")) return;

  // Everything else: network first, fall back to cache
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // Cache successful responses
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, clone);
          });
        }
        return response;
      })
      .catch(() => {
        // Offline: return cached version
        return caches.match(event.request).then((cached) => {
          return cached || new Response("Offline", { status: 503 });
        });
      })
  );
});

// ─── Notifications natives (spec 068, ADR-0024) ─────────────────────────────
// Le contenu est celui de la cloche : titre, message, lien relatif à Koinonia.
self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = {};
  }
  const title = payload.title || "Koinonia";
  event.waitUntil(
    self.registration.showNotification(title, {
      body: payload.body || "",
      // Icône réglable (spec 069) : déposée, ou redirection vers l'icône livrée.
      icon: "/api/app-icon/icon-192.png",
      badge: "/api/app-icon/badge-96.png",
      tag: payload.tag,
      data: { url: payload.url || "/accueil" },
    })
  );
});

// Ouvre l'écran de la notification, comme un clic dans la cloche. Toujours sur l'origine de
// Koinonia : un lien externe ramène à l'accueil.
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const raw = (event.notification.data && event.notification.data.url) || "/accueil";
  const target = new URL(raw, self.location.origin);
  const url = target.origin === self.location.origin ? target.href : new URL("/accueil", self.location.origin).href;

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((windows) => {
      const open = windows.find((client) => new URL(client.url).origin === self.location.origin);
      if (open) {
        return open.focus().then((client) => (client && "navigate" in client ? client.navigate(url) : client));
      }
      return self.clients.openWindow(url);
    })
  );
});
