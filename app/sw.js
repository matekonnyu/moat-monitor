// konninvest Moat Monitor – service worker
// Az alkalmazás héja offline is elérhető; az adatok hálózat-először töltődnek, hiba esetén a cache-ből.
const SHELL = "ki-shell-v2";
const DATA = "ki-data-v1";
const SHELL_FILES = ["./", "index.html", "manifest.webmanifest", "icon.svg", "icon-maskable.svg"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(SHELL).then((c) => c.addAll(SHELL_FILES)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== SHELL && k !== DATA).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET") return;

  // Adatok: hálózat először, utána cache
  if (url.pathname.endsWith("/adatok.json")) {
    e.respondWith(
      fetch(e.request)
        .then((res) => {
          const copy = res.clone();
          caches.open(DATA).then((c) => c.put(url.origin + url.pathname, copy));
          return res;
        })
        .catch(() => caches.match(url.origin + url.pathname))
    );
    return;
  }

  // App-héj: hálózat először (így a frissítések azonnal megérkeznek), offline a cache-ből
  if (url.origin === location.origin) {
    e.respondWith(
      fetch(e.request)
        .then((res) => {
          if (res.ok) { const copy = res.clone(); caches.open(SHELL).then((c) => c.put(e.request, copy)); }
          return res;
        })
        .catch(() => caches.match(e.request).then((hit) => hit || caches.match("index.html")))
    );
  }
});
