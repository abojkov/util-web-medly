const CACHE = "medly-shell-v42";
const ASSETS = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./assets/images/medly-social-preview.jpg",
  "./assets/css/app.css",
  "./assets/vendor/bootstrap.min.css",
  "./assets/icons/icon.svg",
  "./assets/icons/chevron-down.svg",
  "./assets/icons/search.svg",
  "./assets/icons/icon-192.png",
  "./assets/icons/icon-512.png",
  "./assets/js/app.js",
  "./assets/js/router.js",
  "./assets/js/db/schema.js",
  "./assets/js/db/database.js",
  "./assets/js/db/repository.js",
  "./assets/js/db/migrations.js",
  "./assets/js/db/relationships.js",
  "./assets/js/utils/validation.js",
  "./assets/js/utils/format.js",
  "./assets/js/utils/care.js",
  "./assets/js/utils/visits.js",
  "./assets/js/services/backup.js",
  "./assets/js/services/history.js",
  "./assets/js/components/icons.js",
  "./assets/js/components/feedback.js",
  "./assets/js/components/record-form.js",
  "./assets/js/components/appointment-completion.js",
  "./assets/js/components/form-fields.js",
  "./assets/js/components/treatment-editor.js",
  "./assets/js/views/shared.js",
  "./assets/js/views/dashboard.js",
  "./assets/js/views/records.js",
  "./assets/js/views/visit-episode.js",
  "./assets/js/views/settings.js",
];
self.addEventListener("install", (event) =>
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(ASSETS))),
);
self.addEventListener("activate", (event) =>
  event.waitUntil(
    (async () => {
      for (const name of await caches.keys())
        if (name.startsWith("medly-shell-") && name !== CACHE)
          await caches.delete(name);
      await self.clients.claim();
    })(),
  ),
);
self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") self.skipWaiting();
});
self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const urls = ASSETS.map(
    (asset) => new URL(asset, self.registration.scope).href,
  );
  const url = new URL(event.request.url);
  // Request URLs can retain the client's route fragment even though HTTP omits it.
  url.hash = "";
  if (event.request.mode === "navigate") url.search = "";
  if (!urls.includes(url.href)) return;
  event.respondWith(
    caches
      .open(CACHE)
      .then(
        async (cache) => (await cache.match(url.href)) || fetch(event.request),
      ),
  );
});
