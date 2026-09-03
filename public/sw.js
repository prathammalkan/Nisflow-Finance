const CACHE_NAME = 'nisflow-v2';
const STATIC_ASSETS = [
  '/manifest.webmanifest',
  '/1l.png',
  '/icon.svg',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  
  // NEVER intercept non-GET requests (e.g. POST, PUT, DELETE, PATCH)
  if (event.request.method !== 'GET') return;
  
  // NEVER cache or intercept API endpoints, auth endpoints, or Supabase backend requests
  if (
    url.pathname.startsWith('/api/') ||
    url.pathname.startsWith('/auth/') ||
    url.hostname.includes('supabase.co')
  ) {
    return;
  }
  
  // Network first for navigation (HTML pages)
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).catch(() => caches.match('/dashboard') || caches.match('/'))
    );
    return;
  }
  
  // Cache first for static assets (JS, CSS, images, fonts)
  if (
    url.pathname.match(/\.(js|css|png|svg|ico|woff|woff2|ttf)$/) ||
    url.hostname.includes('fonts.gstatic.com') ||
    url.hostname.includes('fonts.googleapis.com')
  ) {
    event.respondWith(
      caches.match(event.request).then((cached) => {
        return cached || fetch(event.request).then((response) => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          return response;
        });
      })
    );
    return;
  }
});

self.addEventListener("push", (event) => {
  if (!event.data) return;

  try {
    const data = event.data.json();
    const options = {
      body: data.body,
      icon: "/1l.png", // Fallback to PWA icon
      badge: "/1l.png",
      vibrate: [100, 50, 100],
      data: {
        dateOfArrival: Date.now(),
        primaryKey: "2",
        url: data.url || "/",
      },
      actions: [
        {
          action: "explore",
          title: "View Details",
        },
      ],
    };

    event.waitUntil(self.registration.showNotification(data.title, options));
  } catch (e) {
    // If not JSON, just show text
    event.waitUntil(
      self.registration.showNotification("NisFlow Finance", {
        body: event.data.text(),
        icon: "/1l.png",
      })
    );
  }
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  
  if (event.action === "explore" || !event.action) {
    const urlToOpen = new URL(event.notification.data.url, self.location.origin).href;

    event.waitUntil(
      self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((windowClients) => {
        let matchingClient = null;
        for (let i = 0; i < windowClients.length; i++) {
          const windowClient = windowClients[i];
          if (windowClient.url === urlToOpen) {
            matchingClient = windowClient;
            break;
          }
        }
        if (matchingClient) {
          return matchingClient.focus();
        } else {
          return self.clients.openWindow(urlToOpen);
        }
      })
    );
  }
});
