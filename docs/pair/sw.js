// OpenFeedling phone-side service worker.
// Receives web push events from the paired extension (via FCM/Mozilla autopush)
// and renders a native notification. Empty payloads are intentional for v0;
// per-notification body/icon would require RFC 8291 payload encryption.

const ICON = "https://teleport-computer.github.io/open-feedling-web/store-icon-128.png";

self.addEventListener("push", (event) => {
  event.waitUntil(self.registration.showNotification("OpenFeedling", {
    body: "5 minutes of shorts. Cat says: please.",
    icon: ICON,
    badge: ICON,
    tag: "openfeedling",
  }));
});
