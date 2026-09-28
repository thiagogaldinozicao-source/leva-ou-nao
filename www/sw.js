// Service worker do "Leva ou não?": o site abre mesmo sem sinal no mercado.
// Só roda no site (quem registra é offline.js); no app Android os arquivos já vêm no APK.
//
// Estratégia:
//  - index.html e *.js/*.json do app: rede primeiro (atualização chega na hora), cache se estiver offline ou a rede passar de 3 s.
//  - lib/, fonts/, icons/: cache primeiro (não mudam; o .js e o .wasm do ZXing ficam sempre do mesmo par).
//  - Open Food Facts, API e qualquer outro domínio: o SW não toca, vai direto pra rede.
//
// Trocou algo em lib/, fonts/ ou icons/ (ou a lista SHELL)? Suba a VERSAO: o cache velho é apagado.
// O prefixo é só deste app porque o domínio *.github.io é dividido com outros sites do mesmo dono.
const PREFIXO = "levaounao-";
const VERSAO = PREFIXO + "v1";
const PRAZO_REDE_MS = 3000; // rede mais lenta que isso => cópia guardada

const SHELL = [
  "./",
  "index.html",
  "regras.js",
  "categorias.js",
  "offline.js",
  "manifest.json",
  "lib/zxing-reader.js",
  "lib/zxing_reader.wasm",
  "fonts/bebas-neue-latin-400-normal.woff2",
  "fonts/barlow-latin-400-normal.woff2",
  "fonts/barlow-latin-500-normal.woff2",
  "fonts/barlow-latin-600-normal.woff2",
  "fonts/barlow-latin-700-normal.woff2",
  "icons/icon-180.png",
  "icons/icon-192.png",
  "icons/icon-512.png",
];

const ESTATICO = /\/(lib|fonts|icons)\//;

self.addEventListener("install", (ev) => {
  ev.waitUntil((async () => {
    const cache = await caches.open(VERSAO);
    // Tolerante: arquivo que falta (404, rede caiu) não derruba a instalação.
    await Promise.allSettled(SHELL.map((u) => cache.add(new Request(u, { cache: "reload" }))));
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (ev) => {
  ev.waitUntil((async () => {
    const nomes = await caches.keys();
    await Promise.all(nomes.filter((n) => n.startsWith(PREFIXO) && n !== VERSAO).map((n) => caches.delete(n)));
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (ev) => {
  const req = ev.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // Open Food Facts / API: sem cache do SW
  if (ESTATICO.test(url.pathname)) { ev.respondWith(cachePrimeiro(req)); return; }
  if (req.mode === "navigate" || /(\/|\.html|\.js|\.json|\.webmanifest)$/.test(url.pathname)) {
    ev.respondWith(redePrimeiro(ev, req, url));
  }
  // O resto do mesmo domínio passa direto, sem cache.
});

async function cachePrimeiro(req) {
  const cache = await caches.open(VERSAO);
  const achou = await cache.match(req, { ignoreVary: true });
  if (achou) return achou;
  const res = await fetch(req);
  if (res.ok && res.type === "basic") cache.put(req, res.clone());
  return res;
}

async function redePrimeiro(ev, req, url) {
  const cache = await caches.open(VERSAO);
  const chave = url.origin + url.pathname; // sem ?query, pra não acumular cópia
  const rede = fetch(req, { cache: "no-cache" }).then(res => { // revalida com o servidor (304 é barato)
    if (res.ok && res.type === "basic") return cache.put(chave, res.clone()).then(() => res, () => res);
    return res;
  });
  ev.waitUntil(rede.catch(() => {})); // se a cópia guardada sair antes, a rede ainda atualiza o cache
  const guardado = async () => {
    const velho = await cache.match(chave, { ignoreVary: true });
    if (velho || req.mode !== "navigate") return velho;
    return (await cache.match("./", { ignoreVary: true })) || (await cache.match("index.html", { ignoreVary: true }));
  };
  try {
    // Sinal fraco no mercado: sem resposta em PRAZO_REDE_MS, serve a cópia guardada (se houver).
    const lenta = new Promise(r => setTimeout(r, PRAZO_REDE_MS, null));
    const res = await Promise.race([rede, lenta]);
    if (res) return res;
    return (await guardado()) || (await rede);
  } catch (e) {
    return (await guardado()) || Response.error();
  }
}
