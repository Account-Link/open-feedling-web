// OpenFeedling phone-side service worker.
// Receives web push events from the paired extension (via FCM/Mozilla autopush)
// and renders a native notification.

self.addEventListener("push", (event) => {
  let title = "OpenFeedling";
  let body = "Cat noticed you've been scrolling.";
  if (event.data) {
    try {
      const j = event.data.json();
      title = j.title || title;
      body = j.body || body;
    } catch {
      body = event.data.text() || body;
    }
  }
  event.waitUntil(self.registration.showNotification(title, {
    body,
    icon: "https://teleport-computer.github.io/open-feedling-web/store-icon-128.png",
    badge: "https://teleport-computer.github.io/open-feedling-web/store-icon-128.png",
    tag: "openfeedling",
    renotify: true,
  }));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(self.clients.openWindow("https://www.youtube.com/"));
});
