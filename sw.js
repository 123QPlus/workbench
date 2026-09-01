const CACHE = "workbench-v4";
const ASSETS = ["index.html", "data.json", "icon.svg", "manifest.webmanifest"];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const u = new URL(e.request.url);
  if (u.origin !== location.origin) return;

  // 数据类（data.json / index.html）走“网络优先”：推了新数据刷新即生效
  if (u.pathname.endsWith("data.json") || u.pathname.endsWith("index.html")) {
    e.respondWith(
      fetch(e.request)
        .then((res) => {
          const cp = res.clone();
          caches.open(CACHE).then((c) => c.put(e.request, cp));
          return res;
        })
        .catch(() => caches.match(e.request).then((r) => r || caches.match("index.html")))
    );
    return;
  }

  // 静态资源（图标/清单）走“缓存优先”，离线也能开
  e.respondWith(
    caches.match(e.request).then((r) =>
      r ||
      fetch(e.request)
        .then((res) => {
          const cp = res.clone();
          caches.open(CACHE).then((c) => c.put(e.request, cp));
          return res;
        })
        .catch(() => caches.match("index.html"))
    )
  );
});
