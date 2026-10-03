/* Ancienne adresse de Chantier : le service worker se retire et vide son cache. */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(k => Promise.all(k.filter(n => n.startsWith('chantier-')).map(n => caches.delete(n))))
    .then(() => self.registration.unregister()));
});
