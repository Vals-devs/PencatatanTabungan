/**
 * @fileoverview OurFinance PWA — Service Worker
 * 
 * Strategi Caching:
 *  1. Aset Statis (HTML, CSS, JS, Ikon) -> Cache First (Pre-cache saat install)
 *  2. API Call (Google Apps Script) -> Network Only (Selalu ambil data terupdate)
 *  3. Navigasi Halaman -> Cache First, fallback ke offline.html jika koneksi terputus
 */

const CACHE_NAME = "ourfinance-v3";

// Daftar aset statis yang akan di-pre-cache
const STATIC_ASSETS = [
  "./",
  "./index.html",
  "./offline.html",
  "./manifest.json",
  "./css/style.css",
  "./js/app.js",
  "./assets/icon-192.png",
  "./assets/icon-512.png"
];

// Event: install (Pre-cache semua aset statis)
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log("[SW] Pre-caching static assets...");
        // Gunakan return cache.addAll agar jika ada satu aset yang gagal, proses cache tidak terganggu
        // Tapi pastikan semua aset yang didefinisikan memang ada
        return cache.addAll(STATIC_ASSETS);
      })
      .then(() => {
        console.log("[SW] All static assets cached successfully.");
        return self.skipWaiting(); // Ambil alih kendali segera
      })
      .catch((err) => {
        console.error("[SW] Pre-caching failed during install:", err);
      })
  );
});

// Event: activate (Cleanup cache versi lama)
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((cacheKeys) => {
        return Promise.all(
          cacheKeys.map((key) => {
            if (key !== CACHE_NAME) {
              console.log("[SW] Deleting old cache:", key);
              return caches.delete(key);
            }
          })
        );
      })
      .then(() => {
        console.log("[SW] Activated and old caches cleaned.");
        return self.clients.claim(); // Klaim semua client yang terbuka
      })
  );
});

// Event: fetch (Intercept request & apply caching strategy)
self.addEventListener("fetch", (event) => {
  const request = event.request;

  // Strategi 1: Permintaan API ke Google Apps Script (Network Only)
  if (request.url.includes("script.google.com")) {
    event.respondWith(fetch(request));
    return;
  }

  // Strategi 2: Navigasi Halaman (Cache First dengan Offline Fallback)
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .catch(() => {
          console.log("[SW] Network failed for navigation, serving offline.html");
          return caches.match("./offline.html");
        })
    );
    return;
  }

  // Strategi 3: Aset Statis (Cache First)
  event.respondWith(
    caches.match(request)
      .then((cachedResponse) => {
        if (cachedResponse) {
          return cachedResponse; // Kembalikan dari cache jika ada
        }
        
        // Jika tidak ada di cache, ambil dari jaringan
        return fetch(request).then((networkResponse) => {
          // Hanya cache respon yang valid (status 200/ok)
          if (!networkResponse || networkResponse.status !== 200 || networkResponse.type !== "basic") {
            return networkResponse;
          }

          // Salin respon karena body respon hanya bisa dibaca sekali
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(request, responseToCache);
          });

          return networkResponse;
        });
      })
  );
});
