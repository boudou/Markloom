// Service worker for the web version: it lets Markloom open offline once visited and makes it
// installable. vite.config.ts copies it into dist/ with __VERSION__ filled in, so each release
// gets its own cache and drops the previous one once no open tab still uses it.
// The desktop app never registers it (see src/main.tsx).

const CACHE = 'markloom-__VERSION__';

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
  );
});

// A full or write-refusing cache must not fail a response the network delivered
async function store(cache, request, response) {
  if (!response.ok) return;

  try {
    await cache.put(request, response.clone());
  } catch {
    // Not cached: this file won't be available offline, nothing else changes
  }
}

async function cached(request) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(request);

  if (hit) return hit;

  const response = await fetch(request);

  await store(cache, request, response);

  return response;
}

async function fresh(request) {
  const cache = await caches.open(CACHE);

  try {
    const response = await fetch(request);

    await store(cache, request, response);

    return response;
  } catch (error) {
    const hit = (await cache.match(request)) ?? (request.mode === 'navigate' ? await cache.match(self.registration.scope) : undefined);

    if (hit) return hit;
    throw error;
  }
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  if (request.method !== 'GET' || url.origin !== self.location.origin) return;

  // Build files have content hashes in their names, so a cached copy is never stale;
  // the page, manifest and icons come from the network first and from the cache offline
  event.respondWith(url.pathname.includes('/assets/') ? cached(request) : fresh(request));
});
