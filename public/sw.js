self.addEventListener("push", (event) => {
  if (!event.data) return;

  try {
    const data = event.data.json();
    const options = {
      body: data.body,
      icon: "/icon512_rounded.png", // Fallback to PWA icon
      badge: "/icon512_rounded.png",
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
        icon: "/icon512_rounded.png",
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
