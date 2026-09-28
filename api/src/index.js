// API do "Leva ou não?" — Cloudflare Workers + D1, JS puro.
//   GET  /v1/produto/{ean}   base própria → Open Food Facts → OBF/OPFF/OPF → remédio → sem_cadastro
//   POST /v1/rotulo-texto    texto que o APARELHO leu do rótulo (ML Kit / iOS / digitado) → regras → produto
//   POST /v1/metrica         contagem agregada por dia (nada pessoal, nem IP)
//   cron                     devolve ao Open Food Facts os ingredientes lidos do rótulo
// Sem IA em lugar nenhum. Nenhuma foto passa por aqui. Chave só em segredo do Cloudflare.
import "../../www/rotulo.js"; // define globalThis.Rotulo (mesmo arquivo que o app usa)
import { buscaRemedio } from "./remedio.js";
import { eanValido, parecidos, semIngredientes, bytes, diaBrasilia } from "./util.js";

const Rotulo = globalThis.Rotulo;

// mesmos campos que o app pede (www/index.html, const FIELDS)
const FIELDS = "product_name,product_name_pt,generic_name_pt,brands,quantity,image_front_small_url,ingredients_text_pt,ingredients_text,additives_tags,nova_group,nutriscore_grade,nutriments,categories_tags";
const TRINTA_DIAS = 30 * 24 * 3600 * 1000;
const CACHE_OK_S = 3600, CACHE_SEM_S = 900;

const OFF = { fonte: "off", categoria: "alimento", host: "https://world.openfoodfacts.org" };
const IRMAS = [ // depois do OFF, nesta ordem de prioridade
  { fonte: "obf", categoria: "cosmetico", host: "https://world.openbeautyfacts.org" },
  { fonte: "opff", categoria: "pet", host: "https://world.openpetfoodfacts.org" },
  { fonte: "opf", categoria: "limpeza", host: "https://world.openproductsfacts.org" },
];
const POR_FONTE = Object.fromEntries([OFF, ...IRMAS].map(b => [b.fonte, b]));
const POR_CATEGORIA = Object.fromEntries([OFF, ...IRMAS].map(b => [b.categoria, b]));
const FONTES_LEITURA = new Set(["mlkit", "ios", "digitado"]);
const EVENTOS = new Set(["busca", "rotulo"]);

/* ---------- resposta: JSON + CORS ---------- */
function cors(req, env) {
  const h = { Vary: "Origin" };
  const o = req.headers.get("Origin");
  const ok = String(env.ALLOWED_ORIGINS || "").split(",").map(s => s.trim().replace(/\/+$/, "")).filter(Boolean);
  if (o && ok.includes(o)) {
    h["Access-Control-Allow-Origin"] = o;
    h["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS";
    h["Access-Control-Allow-Headers"] = "Content-Type";
    h["Access-Control-Max-Age"] = "86400";
  }
  return h;
}
function json(req, env, status, corpo) {
  return new Response(JSON.stringify(corpo), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", ...cors(req, env) },
  });
}
const erro = (req, env, status, motivo) => json(req, env, status, { status: "erro", motivo });

/* ---------- proteção ---------- */
// o IP só vira chave do contador da Cloudflare; não é gravado em lugar nenhum
async function passaLimite(rl, req) {
  if (!rl) return true;
  try { return (await rl.limit({ key: req.headers.get("CF-Connecting-IP") || "?" })).success; }
  catch { return true; }
}
async function lerJson(req, max) {
  if (Number(req.headers.get("Content-Length") || 0) > max) return { falha: 413 };
  const txt = await req.text();
  if (bytes(txt) > max) return { falha: 413 };
  try {
    const v = JSON.parse(txt);
    return v && typeof v === "object" && !Array.isArray(v) ? { v } : { falha: 400 };
  } catch { return { falha: 400 }; }
}
// Turnstile só se o segredo existir (sem segredo = desligado)
async function turnstileOk(env, token) {
  if (!env.TURNSTILE_SECRET) return true;
  if (typeof token !== "string" || !token || token.length > 2048) return false;
  const form = new FormData();
  form.append("secret", env.TURNSTILE_SECRET);
  form.append("response", token);
  try {
    const r = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", { method: "POST", body: form, signal: AbortSignal.timeout(5000) });
    const j = await r.json();
    return !!(j && j.success);
  } catch { return false; }
}

/* ---------- cache de borda (Cache API) ---------- */
const chaveCache = (req, ean) => new Request(new URL("/v1/produto/" + ean, req.url).toString());
async function lerCache(req, ean) {
  try {
    const r = await caches.default.match(chaveCache(req, ean));
    return r ? await r.json() : null;
  } catch { return null; }
}
function guardaCache(ctx, req, ean, corpo, segundos) {
  const r = new Response(JSON.stringify(corpo), { headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "public, max-age=" + segundos } });
  ctx.waitUntil(caches.default.put(chaveCache(req, ean), r).catch(() => {}));
}
function apagaCache(ctx, req, ean) {
  ctx.waitUntil(caches.default.delete(chaveCache(req, ean)).catch(() => {}));
}

/* ---------- bases abertas (Open Food Facts e irmãs) ---------- */
async function buscaBase(env, base, ean) {
  const r = await fetch(`${base.host}/api/v2/product/${ean}.json?fields=${FIELDS}`, {
    headers: { "User-Agent": env.OFF_USER_AGENT || "LevaOuNao/1.0", Accept: "application/json" },
    signal: AbortSignal.timeout(4000),
  });
  if (r.status === 404) return null;
  if (!r.ok) throw new Error("http " + r.status);
  const j = await r.json();
  return j && j.status === 1 && j.product ? j.product : null;
}
// → { produto, categoria, fonte } | { produto: null, falhou, falhouOff }
async function buscaFora(env, ean) {
  let falhou = false, falhouOff = false;
  try {
    const p = await buscaBase(env, OFF, ean);
    if (p) return { produto: p, categoria: OFF.categoria, fonte: OFF.fonte };
  } catch { falhou = falhouOff = true; }
  // irmãs + remédio em paralelo; vale a primeira que achar, na ordem de prioridade
  const r = await Promise.allSettled([
    ...IRMAS.map(b => buscaBase(env, b, ean)),
    Promise.resolve().then(() => buscaRemedio(env, ean)),
  ]);
  for (let i = 0; i < r.length; i++) {
    if (r[i].status === "rejected") { falhou = true; continue; }
    if (!r[i].value) continue;
    if (i < IRMAS.length) return { produto: r[i].value, categoria: IRMAS[i].categoria, fonte: IRMAS[i].fonte };
    return { produto: r[i].value, categoria: "remedio", fonte: "cmed" };
  }
  return { produto: null, falhou, falhouOff };
}

/* ---------- D1 ---------- */
function montaProduto(ean, dados, categoria, fonte) {
  const { _categoria, _fonte, ...resto } = dados || {};
  return { code: ean, ...resto, _categoria: categoria, _fonte: fonte };
}
function limpaDados(dados) {
  const { _categoria, _fonte, ...resto } = dados || {};
  return resto;
}
const gravaProduto = (env, ean, dados, categoria, fonte, agora) => env.DB.prepare(
  `INSERT INTO produto (ean, dados, categoria, fonte, atualizado_em) VALUES (?1, ?2, ?3, ?4, ?5)
   ON CONFLICT(ean) DO UPDATE SET dados = excluded.dados, categoria = excluded.categoria, fonte = excluded.fonte, atualizado_em = excluded.atualizado_em`
).bind(ean, JSON.stringify(limpaDados(dados)), categoria, fonte, agora);

// > 30 dias: busca de novo na origem; ingredientes lidos do rótulo ficam se a origem ainda não tiver
async function revalida(env, ean, row, antigo) {
  let novo;
  if (row.fonte === "cmed") novo = await buscaRemedio(env, ean);
  else if (POR_FONTE[row.fonte]) novo = await buscaBase(env, POR_FONTE[row.fonte], ean);
  else return;
  let dados = antigo;
  if (novo) {
    dados = novo;
    if (antigo._lido && semIngredientes(novo)) dados = { ...novo, ingredients_text_pt: antigo.ingredients_text_pt, _lido: true, _rotulo: antigo._rotulo };
  }
  await env.DB.prepare("UPDATE produto SET dados = ?2, atualizado_em = ?3 WHERE ean = ?1")
    .bind(ean, JSON.stringify(limpaDados(dados)), Date.now()).run();
}

/* ---------- GET /v1/produto/{ean} ---------- */
async function getProduto(req, env, ctx, ean) {
  if (!eanValido(ean)) return erro(req, env, 400, "ean_invalido");
  if (!(await passaLimite(env.RL_BUSCA, req))) return erro(req, env, 429, "limite");

  const c = await lerCache(req, ean);
  if (c) return json(req, env, 200, c);

  const row = await env.DB.prepare("SELECT dados, categoria, fonte, atualizado_em FROM produto WHERE ean = ?1").bind(ean).first();
  if (row) {
    const dados = JSON.parse(row.dados);
    if (row.fonte !== "base" && Date.now() - row.atualizado_em > TRINTA_DIAS) {
      ctx.waitUntil(revalida(env, ean, row, dados).catch(e => console.log("revalida", ean, e.message)));
    }
    const corpo = { status: "ok", produto: montaProduto(ean, dados, row.categoria, row.fonte) };
    guardaCache(ctx, req, ean, corpo, CACHE_OK_S);
    return json(req, env, 200, corpo);
  }

  const a = await buscaFora(env, ean);
  if (a.produto) {
    ctx.waitUntil(gravaProduto(env, ean, a.produto, a.categoria, a.fonte, Date.now()).run().catch(e => console.log("d1", ean, e.message)));
    const corpo = { status: "ok", produto: montaProduto(ean, a.produto, a.categoria, a.fonte) };
    guardaCache(ctx, req, ean, corpo, CACHE_OK_S);
    return json(req, env, 200, corpo);
  }
  if (a.falhouOff) return erro(req, env, 503, "fonte_indisponivel"); // não dá pra afirmar "sem cadastro"
  const corpo = { status: "sem_cadastro" };
  if (!a.falhou) guardaCache(ctx, req, ean, corpo, CACHE_SEM_S);
  return json(req, env, 200, corpo);
}

/* ---------- POST /v1/rotulo-texto ---------- */
async function postRotulo(req, env, ctx) {
  if (!(await passaLimite(env.RL_ROTULO, req))) return erro(req, env, 429, "limite");
  const { v: b, falha } = await lerJson(req, 16 * 1024);
  if (falha) return erro(req, env, falha, falha === 413 ? "grande_demais" : "json_invalido");

  const ean = String(b.ean ?? "").trim();
  if (!eanValido(ean)) return erro(req, env, 400, "ean_invalido");
  if (typeof b.texto !== "string" || !b.texto.trim()) return erro(req, env, 400, "texto_vazio");
  if (bytes(b.texto) > 8 * 1024) return erro(req, env, 413, "texto_grande");
  if (!FONTES_LEITURA.has(b.fonte)) return erro(req, env, 400, "fonte_invalida");
  if (!(await turnstileOk(env, b.turnstile))) return erro(req, env, 403, "turnstile");

  const lido = Rotulo.ler(b.texto);
  const agora = Date.now();
  const anterior = await env.DB.prepare(
    "SELECT ingredientes FROM leitura WHERE ean = ?1 AND ingredientes IS NOT NULL ORDER BY criado_em DESC, id DESC LIMIT 1"
  ).bind(ean).first();
  const insLeitura = env.DB.prepare("INSERT INTO leitura (ean, fonte, texto, ingredientes, criado_em) VALUES (?1, ?2, ?3, ?4, ?5)")
    .bind(ean, b.fonte, b.texto, lido.ingredientes, agora);
  if (!lido.ingredientes) { await insLeitura.run(); return erro(req, env, 422, "sem_ingredientes"); }
  const diverge = !!(anterior && !parecidos(anterior.ingredientes, lido.ingredientes));

  // mescla com o que já se sabe do produto (D1 → cache → bases abertas)
  const row = await env.DB.prepare("SELECT dados, categoria, fonte, revisao FROM produto WHERE ean = ?1").bind(ean).first();
  let base = null, categoria = "alimento", fonte = "base";
  if (row) { base = JSON.parse(row.dados); categoria = row.categoria; fonte = row.fonte; }
  else {
    const c = await lerCache(req, ean);
    if (c && c.status === "ok" && c.produto) { base = c.produto; categoria = c.produto._categoria || categoria; fonte = c.produto._fonte || fonte; }
    else if (!c) {
      try { const a = await buscaFora(env, ean); if (a.produto) { base = a.produto; categoria = a.categoria; fonte = a.fonte; } }
      catch { /* segue só com o rótulo */ }
    }
  }
  const dados = limpaDados({
    ...(base || {}),
    ingredients_text_pt: lido.ingredientes,
    _lido: true,
    _rotulo: { alergenos: lido.alergenos, altoEm: lido.altoEm, contem: lido.contem },
  });
  delete dados.code;

  await env.DB.batch([
    insLeitura,
    env.DB.prepare(
      `INSERT INTO produto (ean, dados, categoria, fonte, atualizado_em, revisao) VALUES (?1, ?2, ?3, ?4, ?5, ?6)
       ON CONFLICT(ean) DO UPDATE SET dados = excluded.dados, atualizado_em = excluded.atualizado_em, revisao = MAX(produto.revisao, excluded.revisao)`
    ).bind(ean, JSON.stringify(dados), categoria, fonte, agora, diverge ? 1 : 0),
  ]);
  apagaCache(ctx, req, ean);
  return json(req, env, 200, { status: "ok", produto: montaProduto(ean, dados, categoria, fonte), revisao: diverge || !!(row && row.revisao) });
}

/* ---------- POST /v1/metrica ---------- */
async function postMetrica(req, env) {
  if (!(await passaLimite(env.RL_BUSCA, req))) return erro(req, env, 429, "limite");
  const { v: b, falha } = await lerJson(req, 1024);
  if (falha) return erro(req, env, falha, falha === 413 ? "grande_demais" : "json_invalido");
  if (!EVENTOS.has(b.evento) || typeof b.achou !== "boolean") return erro(req, env, 400, "metrica_invalida");
  const ms = Math.max(0, Math.min(600000, Math.round(Number(b.ms) || 0)));
  await env.DB.prepare(
    `INSERT INTO metrica_dia (dia, evento, achou, n, soma_ms) VALUES (?1, ?2, ?3, 1, ?4)
     ON CONFLICT(dia, evento, achou) DO UPDATE SET n = n + 1, soma_ms = soma_ms + excluded.soma_ms`
  ).bind(diaBrasilia(), b.evento, b.achou ? 1 : 0, ms).run();
  return new Response(null, { status: 204, headers: { "Cache-Control": "no-store", ...cors(req, env) } });
}

/* ---------- cron: devolve ao Open Food Facts ----------
   Só produto lido do rótulo, sem divergência (revisao = 0) e ainda não enviado. Sem OFF_USER/OFF_PASS: não faz nada.
   Não sobrescreve: se a base já tem ingredientes em português, só marca como resolvido. */
async function enviaAoOff(env) {
  if (!env.OFF_USER || !env.OFF_PASS) return;
  const { results } = await env.DB.prepare(
    `SELECT p.ean, p.dados, p.categoria FROM produto p
     WHERE p.revisao = 0 AND p.enviado_off_em IS NULL AND p.categoria IN ('alimento', 'cosmetico', 'pet', 'limpeza')
       AND EXISTS (SELECT 1 FROM leitura l WHERE l.ean = p.ean AND l.ingredientes IS NOT NULL)
     ORDER BY p.atualizado_em LIMIT 25`
  ).all();
  const marca = ean => env.DB.prepare("UPDATE produto SET enviado_off_em = ?2 WHERE ean = ?1").bind(ean, Date.now()).run();
  for (const r of results || []) {
    try {
      const dados = JSON.parse(r.dados);
      if (!dados._lido || !dados.ingredients_text_pt) continue;
      const base = POR_CATEGORIA[r.categoria];
      let atual;
      try { atual = await buscaBase(env, base, r.ean); } catch { continue; } // fora do ar: próximo cron
      if (atual && atual.ingredients_text_pt) { await marca(r.ean); continue; }
      const form = new URLSearchParams({
        code: r.ean, user_id: env.OFF_USER, password: env.OFF_PASS,
        ingredients_text_pt: dados.ingredients_text_pt,
        comment: "Leva ou não? — lido do rótulo",
        app_name: "LevaOuNao", app_version: "1.0",
      });
      if (!atual) { form.set("lang", "pt"); form.set("countries", "Brasil"); } // produto novo lá
      const resp = await fetch(base.host + "/cgi/product_jqm2.pl", {
        method: "POST",
        headers: { "User-Agent": env.OFF_USER_AGENT || "LevaOuNao/1.0", "Content-Type": "application/x-www-form-urlencoded" },
        body: form,
        signal: AbortSignal.timeout(10000),
      });
      const j = await resp.json().catch(() => null);
      if (resp.ok && j && j.status === 1) await marca(r.ean);
      else console.log("off recusou", r.ean, resp.status, j && j.status_verbose);
    } catch (e) { console.log("off falhou", r.ean, e.message); }
  }
}

export default {
  async fetch(req, env, ctx) {
    try {
      if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors(req, env) });
      const { pathname } = new URL(req.url);
      const m = pathname.match(/^\/v1\/produto\/([^/]+)\/?$/);
      if (m) return req.method === "GET" ? await getProduto(req, env, ctx, m[1]) : erro(req, env, 405, "metodo");
      if (pathname === "/v1/rotulo-texto") return req.method === "POST" ? await postRotulo(req, env, ctx) : erro(req, env, 405, "metodo");
      if (pathname === "/v1/metrica") return req.method === "POST" ? await postMetrica(req, env) : erro(req, env, 405, "metodo");
      return erro(req, env, 404, "rota");
    } catch (e) {
      console.log("interno", e && e.message); // nunca devolve stack
      return erro(req, env, 500, "interno");
    }
  },
  async scheduled(evento, env, ctx) {
    ctx.waitUntil(enviaAoOff(env).catch(e => console.log("cron", e.message)));
  },
};
