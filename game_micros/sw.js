// Service worker: precachea el juego entero (~2,8 MB) para que funcione sin
// conexión y cargue al instante. Estrategia caché-primero con relleno en
// caliente: si algo no está en caché se pide a la red y se guarda.
//
// ⚠️ Al publicar cambios hay que subir CACHE_VERSION: es lo que hace que el
// navegador detecte el sw.js nuevo, redescargue todo y tire la caché vieja.
// Si se añaden/renombran ficheros, actualizar también la lista PRECACHE.
const CACHE_VERSION = "gamif-micros-v1";

const PRECACHE = [
  "./",
  "./index.html",
  "./manifest.json",
  "./css/style.css",
  "./js/data.js",
  "./js/main.js",
  "./js/quiz.js",
  "./js/sfx.js",
  "./js/world.js",
  "./assets/data/people.json",
  "./assets/lives/0.png",
  "./assets/lives/1.png",
  "./assets/lives/1lives.png",
  "./assets/lives/2lives.png",
  "./assets/lives/3lives.png",
  "./assets/lives/gear.png",
  "./assets/map/collisions.json",
  "./assets/map/icaiMap.png",
  "./assets/music/song.ogg",
  "./assets/people/chica/andar_derecha_1.png",
  "./assets/people/chica/andar_derecha_2.png",
  "./assets/people/chica/andar_espaldas_1.png",
  "./assets/people/chica/andar_espaldas_2.png",
  "./assets/people/chica/andar_frente_1.png",
  "./assets/people/chica/andar_frente_2.png",
  "./assets/people/chica/andar_izquierda_1.png",
  "./assets/people/chica/andar_izquierda_2.png",
  "./assets/people/chica/derecha.png",
  "./assets/people/chica/espaldas.png",
  "./assets/people/chica/frente.png",
  "./assets/people/chica/izquierda.png",
  "./assets/people/chico/andar_derecha_1.png",
  "./assets/people/chico/andar_derecha_2.png",
  "./assets/people/chico/andar_espaldas_1.png",
  "./assets/people/chico/andar_espaldas_2.png",
  "./assets/people/chico/andar_frente_1.png",
  "./assets/people/chico/andar_frente_2.png",
  "./assets/people/chico/andar_izquierda_1.png",
  "./assets/people/chico/andar_izquierda_2.png",
  "./assets/people/chico/derecha.png",
  "./assets/people/chico/espaldas.png",
  "./assets/people/chico/frente.png",
  "./assets/people/chico/izquierda.png",
  "./assets/people/npc/Pau.png",
  "./assets/people/npc/Zape.png",
  "./assets/people/npc/Zipi.png",
  "./assets/people/npc/prueba1.png",
  "./assets/people/npc/prueba2.png",
  "./assets/people/npc/prueba3.png",
  "./assets/people/npc/prueba4.png",
  "./assets/people/npc/prueba5.png",
  "./assets/people/npc/prueba6.png",
  "./assets/people/npc/prueba7.png",
  "./assets/people/npc/prueba8.png",
  "./assets/people/npc/prueba9.png",
  "./assets/people/npc/prueba10.png",
  "./assets/people/npc/prueba11.png",
  "./assets/people/npc/prueba12.png",
  "./assets/people/npc/prueba13.png",
  "./assets/people/npc/prueba14.png",
  "./assets/people/retratos/Pau.png",
  "./assets/people/retratos/Zape.png",
  "./assets/people/retratos/Zipi.png",
  "./assets/people/retratos/prueba1.png",
  "./assets/people/retratos/prueba2.png",
  "./assets/people/retratos/prueba3.png",
  "./assets/people/retratos/prueba4.png",
  "./assets/people/retratos/prueba5.png",
  "./assets/people/retratos/prueba6.png",
  "./assets/people/retratos/prueba7.png",
  "./assets/people/retratos/prueba8.png",
  "./assets/people/retratos/prueba9.png",
  "./assets/people/retratos/prueba10.png",
  "./assets/people/retratos/prueba11.png",
  "./assets/people/retratos/prueba12.png",
  "./assets/people/retratos/prueba13.png",
  "./assets/people/retratos/prueba14.png",
  "./assets/questions/tests.json",
  "./assets/questions/1_programminginc.json",
  "./assets/questions/2_puertosEntrada.json",
  "./assets/questions/3_timers.json",
  "./assets/questions/4_timersLab.json",
  "./assets/questions/5_interrupciones.json",
  "./assets/questions/6_interrupcionesLab.json",
  "./assets/questions/7_UART.json",
  "./assets/questions/8_oc.json",
  "./assets/questions/9_examenLab.json",
  "./assets/questions/10_I2C.json",
  "./assets/questions/11_AD.json",
  "./assets/questions/12_MaqEstados.json",
  "./assets/questions/13_ExFinal.json",
  "./assets/questions/14_proyectoFinal.json",
  "./assets/title/logoComillas.png",
  "./assets/title/logoPokemon.png",
  "./assets/title/title.png",
  "./assets/pwa/icon-180.png",
  "./assets/pwa/icon-192.png",
  "./assets/pwa/icon-512.png",
];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE_VERSION)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((k) => k.startsWith("gamif-micros-") && k !== CACHE_VERSION)
            .map((k) => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET" || new URL(req.url).origin !== location.origin) return;
  e.respondWith(
    // ignoreSearch: que `index.html?touch` sirva el index.html cacheado
    caches.match(req, { ignoreSearch: true }).then((hit) =>
      hit || fetch(req).then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE_VERSION).then((cache) => cache.put(req, copy));
        }
        return res;
      })
    )
  );
});
