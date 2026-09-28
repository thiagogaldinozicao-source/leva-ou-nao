// Servidor estático efêmero de www/ pro gate de navegador: porta livre em 127.0.0.1 (contexto seguro = o
// service worker registra, como no GitHub Pages), gzip no texto e max-age=600 (o que o Pages faz). Nada de
// _headers: o Pages ignora o arquivo, lá só vale a CSP da <meta> do index.html — aqui também.
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { gzipSync } from "node:zlib";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const WWW = fileURLToPath(new URL("../../www/", import.meta.url));
const TIPO = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json", ".wasm": "application/wasm", ".woff2": "font/woff2", ".png": "image/png",
  ".svg": "image/svg+xml", ".ico": "image/x-icon", ".txt": "text/plain; charset=utf-8", ".css": "text/css; charset=utf-8",
};
const TEXTO = /^(text\/|application\/(json|manifest\+json|wasm))|svg/;

// falhar(pathname) -> status HTTP pra forçar erro num arquivo (ex.: 1 arquivo do SHELL do sw.js em 500) ou null.
export async function sobe({ falhar = () => null } = {}) {
  const pedidos = [];
  const srv = createServer(async (req, res) => {
    const u = new URL(req.url, "http://x");
    let rel = decodeURIComponent(u.pathname);
    pedidos.push(rel);
    const st = falhar(rel);
    if (st) { res.writeHead(st, { "content-type": "text/plain" }); res.end("forçado pelo teste"); return; }
    if (rel.endsWith("/")) rel += "index.html";
    const arq = path.join(WWW, path.normalize(rel));
    if (!arq.startsWith(WWW)) { res.writeHead(403); res.end(); return; }
    let corpo;
    try { corpo = await readFile(arq); } catch { res.writeHead(404, { "content-type": "text/plain" }); res.end("404"); return; }
    const tipo = TIPO[path.extname(arq)] || "application/octet-stream";
    const h = { "content-type": tipo, "cache-control": "max-age=600", "x-content-type-options": "nosniff" };
    if (TEXTO.test(tipo) && /\bgzip\b/.test(req.headers["accept-encoding"] || "")) { corpo = gzipSync(corpo); h["content-encoding"] = "gzip"; h.vary = "Accept-Encoding"; }
    res.writeHead(200, h);
    res.end(req.method === "HEAD" ? undefined : corpo);
  });
  await new Promise((ok, erro) => srv.listen(0, "127.0.0.1", ok).on("error", erro));
  const url = `http://127.0.0.1:${srv.address().port}/`;
  const desce = () => new Promise(ok => { srv.closeAllConnections(); srv.close(() => ok()); });
  return { url, pedidos, desce };
}
