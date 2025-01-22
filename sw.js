/* Muestra el aviso de la cuenta atrás. No guarda nada en caché. */
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

self.addEventListener("push", (e) => {
  e.waitUntil(self.registration.showNotification("cuacuacuack", {
    body: "ya hay cuenta atrás",
    icon: "/favicon-192.png",
    tag: "cuenta-atras",
  }));
});

self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  e.waitUntil(self.clients.openWindow("https://jxan.art/"));
});
