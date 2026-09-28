#!/usr/bin/env node
// Fumaça da API LOCAL, sem conta Cloudflare: aplica as migrations num D1 local descartável, põe 1 remédio
// fictício, sobe `wrangler dev` em porta livre e confere status + corpo das 3 rotas contra o que
// src/index.js promete. Rede só pro que a rota faz de verdade (Open Food Facts e irmãs).
// Uso: `cd api && npm ci && npm run fumaca` — ou, sem ocupar o PC, `scripts/vm-run.sh api` (VM de teste).
import { spawn, execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, readFileSync, openSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import net from "node:net";

const API = join(dirname(fileURLToPath(import.meta.url)), "..");
const WRANGLER = join(API, "node_modules", ".bin", "wrangler");
const ESTADO = mkdtempSync(join(tmpdir(), "leva-api-"));
const LOG = join(ESTADO, "wrangler-dev.log");
const ENV = { ...process.env, CI: "1", WRANGLER_SEND_METRICS: "false", NO_COLOR: "1" };
const D1 = ["leva-ou-nao", "--local", "--persist-to", ESTADO];

// EAN-13 com dígito verificador certo (mesma conta de src/util.js eanValido)
const comDv = base => {
  let s = 0;
  for (let i = base.length - 1, p = 3; i >= 0; i--, p = 4 - p) s += Number(base[i]) * p;
  return base + ((10 - (s % 10)) % 10);
};
// Coca-Cola 2 L, cadastrada no Open Food Facts (o `code` das fixtures de tests/ NÃO serve: o do Nescau dá 404 lá)
const EAN_REAL = "7894900011517";
const EAN_REMEDIO = comDv("789999000123"); // fictício: só existe no D1 local
const EAN_NADA = comDv("789999000456"); // fictício: em lugar nenhum
const EAN_ROTULO = comDv("789999000789"); // fictício: ganha ingredientes pelo rótulo

const portaLivre = () => new Promise((ok, falha) => {
  const s = net.createServer();
  s.on("error", falha);
  s.listen(0, "127.0.0.1", () => { const { port } = s.address(); s.close(() => ok(port)); });
});
const wrangler = args => execFileSync(WRANGLER, args, { cwd: API, env: ENV, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
const sql = comando => JSON.parse(wrangler(["d1", "execute", ...D1, "--json", "--command", comando]))[0].results;
const espera = ms => new Promise(r => setTimeout(r, ms));

let falhas = 0;
function confere(nome, ok, detalhe) {
  if (ok) console.log("ok      " + nome);
  else { falhas++; console.log("FALHOU  " + nome + (detalhe ? " -- " + detalhe : "")); }
}

let base, dev;
async function pede(metodo, caminho, corpo, headers = {}) {
  const r = await fetch(base + caminho, {
    method: metodo,
    headers: { ...(corpo !== undefined ? { "Content-Type": "application/json" } : {}), ...headers },
    body: corpo === undefined ? undefined : typeof corpo === "string" ? corpo : JSON.stringify(corpo),
    signal: AbortSignal.timeout(20000),
  });
  const txt = await r.text();
  let j = null;
  try { j = txt ? JSON.parse(txt) : null; } catch { /* corpo não-JSON: fica null */ }
  return { st: r.status, j, txt, h: r.headers };
}
// Open Food Facts fora do ar vira 503 fonte_indisponivel (certo, mas não prova a rota): tenta 3x
async function pedeProduto(ean) {
  let r;
  for (let i = 0; i < 3; i++) {
    r = await pede("GET", "/v1/produto/" + ean);
    if (!(r.st === 503 && r.j && r.j.motivo === "fonte_indisponivel")) return r;
    await espera(3000);
  }
  return r;
}
const mostra = r => `${r.st} ${r.txt.slice(0, 300)}`;

async function principal() {
  // 1. banco local descartável + 1 remédio fictício (a lista CMED real não entra no teste)
  wrangler(["d1", "migrations", "apply", ...D1]);
  wrangler(["d1", "execute", ...D1, "--command",
    `INSERT INTO remedio (ean, nome, principio_ativo, apresentacao, laboratorio, pmc, pmc_icms, referencia, atualizado_em)
     VALUES ('${EAN_REMEDIO}', 'DIPIRONA TESTE', 'DIPIRONA MONOIDRATADA', '500 MG COM CT BL AL PLAS TRANS X 10', 'LABORATORIO TESTE', 12.34, '18%', '2026-09', '2026-09-01T00:00:00Z')`]);
  confere("migrations aplicadas (produto, leitura, metrica_dia, remedio)",
    sql("SELECT name FROM sqlite_master WHERE type='table' AND name IN ('produto','leitura','metrica_dia','remedio')").length === 4);

  // 2. wrangler dev local em porta livre (inspector também: duas rodadas não se pisam)
  const porta = await portaLivre(), inspetor = await portaLivre();
  base = `http://127.0.0.1:${porta}`;
  const fd = openSync(LOG, "w");
  dev = spawn(WRANGLER, ["dev", "--local", "--ip", "127.0.0.1", "--port", String(porta), "--inspector-port", String(inspetor),
    "--persist-to", ESTADO, "--show-interactive-dev-session=false"], { cwd: API, env: ENV, stdio: ["ignore", fd, fd], detached: true });
  const t0 = Date.now();
  for (;;) {
    try { await fetch(base + "/", { signal: AbortSignal.timeout(2000) }); break; } catch { /* ainda subindo */ }
    if (dev.exitCode !== null || Date.now() - t0 > 90000) throw new Error("wrangler dev não subiu em 90s");
    await espera(500);
  }
  console.log(`>> wrangler dev em ${base} (${((Date.now() - t0) / 1000).toFixed(1)}s)`);

  // 3. GET /v1/produto/{ean}
  let r = await pede("GET", "/v1/produto/123");
  confere("GET produto: EAN curto -> 400 ean_invalido", r.st === 400 && r.j?.status === "erro" && r.j?.motivo === "ean_invalido", mostra(r));
  r = await pede("GET", "/v1/produto/7891000055121");
  confere("GET produto: dígito verificador errado -> 400 ean_invalido", r.st === 400 && r.j?.motivo === "ean_invalido", mostra(r));
  r = await pedeProduto(EAN_REAL);
  confere("GET produto: EAN real -> 200 ok, Open Food Facts, alimento",
    r.st === 200 && r.j?.status === "ok" && r.j.produto?.code === EAN_REAL && r.j.produto._fonte === "off" &&
    r.j.produto._categoria === "alimento" && !!(r.j.produto.product_name || r.j.produto.product_name_pt), mostra(r));
  confere("GET produto: JSON + no-store + nosniff",
    /application\/json/.test(r.h.get("content-type")) && r.h.get("cache-control") === "no-store" && r.h.get("x-content-type-options") === "nosniff",
    [...r.h].map(([k, v]) => k + "=" + v).join(" "));
  r = await pedeProduto(EAN_REMEDIO);
  confere("GET produto: remédio (CMED no D1) -> 200 ok, só informação",
    r.st === 200 && r.j?.status === "ok" && r.j.produto?._categoria === "remedio" && r.j.produto._fonte === "cmed" &&
    r.j.produto.product_name === "DIPIRONA TESTE" && r.j.produto.pmc === 12.34 && r.j.produto.pmc_icms === "18%" &&
    r.j.produto._referencia === "2026-09" && r.j.produto.code === EAN_REMEDIO, mostra(r));
  r = await pedeProduto(EAN_NADA);
  confere("GET produto: EAN em lugar nenhum -> 200 sem_cadastro", r.st === 200 && r.j?.status === "sem_cadastro", mostra(r));

  // 4. POST /v1/rotulo-texto (texto como o ML Kit devolve: linhas quebradas, caixa alta)
  const ROTULO = [
    "BISCOITO RECHEADO SABOR CHOCOLATE",
    "INGREDIENTES: Farinha de trigo enriquecida com ferro e",
    "ácido fólico, açúcar, gordura vegetal, cacau em pó, açúcar",
    "invertido, amido, sal, fermento químico bicarbonato de sódio,",
    "emulsificante lecitina de soja e aromatizante.",
    "ALÉRGICOS: CONTÉM TRIGO, SOJA E DERIVADOS DE LEITE.",
    "PODE CONTER AMENDOIM. CONTÉM GLÚTEN.",
    "ALTO EM AÇÚCAR ADICIONADO E GORDURA SATURADA",
    "INFORMAÇÃO NUTRICIONAL Porção de 30 g (3 biscoitos)",
  ].join("\n");
  r = await pede("POST", "/v1/rotulo-texto", { ean: EAN_ROTULO, texto: ROTULO, fonte: "mlkit" });
  const p = r.j?.produto || {};
  confere("POST rotulo-texto: 200 ok, produto novo da base própria",
    r.st === 200 && r.j?.status === "ok" && p.code === EAN_ROTULO && p._fonte === "base" && p._categoria === "alimento" &&
    p._lido === true && r.j.revisao === false, mostra(r));
  confere("POST rotulo-texto: ingredientes cortados entre INGREDIENTES e ALÉRGICOS",
    /^farinha de trigo/i.test(p.ingredients_text_pt || "") && /aromatizante/i.test(p.ingredients_text_pt) &&
    !/al[ée]rgic|alto em|informa[cç][aã]o|pode conter/i.test(p.ingredients_text_pt), JSON.stringify(p.ingredients_text_pt));
  confere("POST rotulo-texto: alérgenos só do CONTÉM (amendoim de 'pode conter' fora)",
    JSON.stringify(p._rotulo?.alergenos) === JSON.stringify(["trigo", "soja", "leite"]), JSON.stringify(p._rotulo?.alergenos));
  confere("POST rotulo-texto: lupa ALTO EM + contém glúten",
    JSON.stringify(p._rotulo?.altoEm) === JSON.stringify(["acucar_adicionado", "gordura_saturada"]) &&
    p._rotulo?.contem?.gluten === true && p._rotulo?.contem?.lactose === null, JSON.stringify(p._rotulo));
  r = await pedeProduto(EAN_ROTULO);
  confere("GET produto depois do rótulo: vem do D1 com os ingredientes lidos",
    r.st === 200 && r.j?.status === "ok" && r.j.produto?._fonte === "base" && r.j.produto._lido === true &&
    r.j.produto.ingredients_text_pt === p.ingredients_text_pt, mostra(r));
  r = await pede("POST", "/v1/rotulo-texto", { ean: EAN_ROTULO, texto: "Ingredientes: água, sal, conservante sorbato de potássio.", fonte: "digitado" });
  confere("POST rotulo-texto: 2a leitura que não bate -> revisao true", r.st === 200 && r.j?.revisao === true, mostra(r));
  confere("POST rotulo-texto: 2a leitura devolve o que foi lido pra quem leu", /sorbato/i.test(r.j?.produto?.ingredients_text_pt || ""), mostra(r));
  r = await pedeProduto(EAN_ROTULO);
  confere("GET produto depois da 2a leitura: produto NÃO trocou (só revisao)",
    r.st === 200 && r.j?.produto?.ingredients_text_pt === p.ingredients_text_pt, mostra(r));
  // sem o cabeçalho INGREDIENTES, texto curto passa de propósito ("leite integral", www/rotulo.js achaIngredientes);
  // texto longo sem vírgula e sem cabeçalho (frente da embalagem) não é lista
  r = await pede("POST", "/v1/rotulo-texto", { ean: EAN_ROTULO, texto: "PROMOÇÃO LEVE 3 PAGUE 2 SOMENTE NESTA SEMANA NAS LOJAS PARTICIPANTES DE TODO O BRASIL", fonte: "ios" });
  confere("POST rotulo-texto: frente da embalagem (sem lista) -> 422 sem_ingredientes", r.st === 422 && r.j?.motivo === "sem_ingredientes", mostra(r));
  r = await pede("POST", "/v1/rotulo-texto", "{nao e json");
  confere("POST rotulo-texto: JSON inválido -> 400 json_invalido", r.st === 400 && r.j?.motivo === "json_invalido", mostra(r));
  r = await pede("POST", "/v1/rotulo-texto", { ean: "123", texto: ROTULO, fonte: "mlkit" });
  confere("POST rotulo-texto: EAN inválido -> 400 ean_invalido", r.st === 400 && r.j?.motivo === "ean_invalido", mostra(r));
  r = await pede("POST", "/v1/rotulo-texto", { ean: EAN_ROTULO, texto: "   ", fonte: "mlkit" });
  confere("POST rotulo-texto: texto vazio -> 400 texto_vazio", r.st === 400 && r.j?.motivo === "texto_vazio", mostra(r));
  r = await pede("POST", "/v1/rotulo-texto", { ean: EAN_ROTULO, texto: ROTULO, fonte: "foto" });
  confere("POST rotulo-texto: fonte fora da lista -> 400 fonte_invalida", r.st === 400 && r.j?.motivo === "fonte_invalida", mostra(r));
  r = await pede("POST", "/v1/rotulo-texto", { ean: EAN_ROTULO, texto: "a".repeat(9000), fonte: "mlkit" });
  confere("POST rotulo-texto: texto > 8 KB -> 413 texto_grande", r.st === 413 && r.j?.motivo === "texto_grande", mostra(r));
  r = await pede("POST", "/v1/rotulo-texto", { ean: EAN_ROTULO, texto: "a".repeat(17000), fonte: "mlkit" });
  confere("POST rotulo-texto: corpo > 16 KB -> 413 grande_demais", r.st === 413 && r.j?.motivo === "grande_demais", mostra(r));

  // 5. POST /v1/metrica
  r = await pede("POST", "/v1/metrica", { evento: "busca", achou: true, ms: 123.4 });
  confere("POST metrica: busca válida -> 204 sem corpo", r.st === 204 && r.txt === "", mostra(r));
  r = await pede("POST", "/v1/metrica", { evento: "busca", achou: true, ms: 77 });
  confere("POST metrica: 2a busca -> 204", r.st === 204, mostra(r));
  r = await pede("POST", "/v1/metrica", { evento: "clique", achou: true });
  confere("POST metrica: evento fora da lista -> 400 metrica_invalida", r.st === 400 && r.j?.motivo === "metrica_invalida", mostra(r));
  r = await pede("POST", "/v1/metrica", { evento: "busca", achou: "sim" });
  confere("POST metrica: achou não-booleano -> 400 metrica_invalida", r.st === 400 && r.j?.motivo === "metrica_invalida", mostra(r));

  // 6. roteamento + CORS
  r = await pede("GET", "/v1/nada");
  confere("rota desconhecida -> 404 rota", r.st === 404 && r.j?.motivo === "rota", mostra(r));
  r = await pede("POST", "/v1/produto/" + EAN_REAL, {});
  confere("método errado -> 405 metodo", r.st === 405 && r.j?.motivo === "metodo", mostra(r));
  r = await pede("OPTIONS", "/v1/rotulo-texto", undefined, { Origin: "https://localhost" });
  confere("CORS: origem do app (https://localhost) liberada", r.st === 204 && r.h.get("access-control-allow-origin") === "https://localhost", mostra(r));
  r = await pede("GET", "/v1/produto/123", undefined, { Origin: "https://intruso.example" });
  confere("CORS: origem de fora sem Access-Control-Allow-Origin", r.h.get("access-control-allow-origin") === null, mostra(r));
}

async function desliga() {
  if (!dev || dev.exitCode !== null) return;
  try { process.kill(-dev.pid, "SIGTERM"); } catch { /* já saiu */ }
  for (let i = 0; i < 20 && dev.exitCode === null; i++) await espera(250);
  try { process.kill(-dev.pid, "SIGKILL"); } catch { /* já saiu */ }
}

try {
  await principal();
  await desliga();
  // 7. o que ficou gravado no D1 (lido com o dev já desligado)
  const prod = Object.fromEntries(sql("SELECT ean, fonte, categoria, revisao FROM produto").map(x => [x.ean, x]));
  confere("D1: produto do Open Food Facts gravado (fonte off)", prod[EAN_REAL]?.fonte === "off", JSON.stringify(prod[EAN_REAL]));
  confere("D1: remédio gravado como cmed/remedio", prod[EAN_REMEDIO]?.fonte === "cmed" && prod[EAN_REMEDIO]?.categoria === "remedio", JSON.stringify(prod[EAN_REMEDIO]));
  confere("D1: sem_cadastro NÃO vira linha de produto", !prod[EAN_NADA], JSON.stringify(prod[EAN_NADA]));
  confere("D1: produto do rótulo marcado pra revisão", prod[EAN_ROTULO]?.revisao === 1 && prod[EAN_ROTULO]?.fonte === "base", JSON.stringify(prod[EAN_ROTULO]));
  const leit = sql(`SELECT COUNT(*) AS n, SUM(ingredientes IS NULL) AS sem FROM leitura WHERE ean = '${EAN_ROTULO}'`)[0];
  confere("D1: 2 leituras guardadas; o 422 (sem ingrediente) NÃO gravou leitura", leit.n === 2 && leit.sem === 0, JSON.stringify(leit));
  const met = sql("SELECT evento, achou, n, soma_ms FROM metrica_dia");
  confere("D1: métrica agregada no dia (n=2, soma 200 ms), nada pessoal",
    met.length === 1 && met[0].evento === "busca" && met[0].achou === 1 && met[0].n === 2 && met[0].soma_ms === 200, JSON.stringify(met));
} catch (e) {
  falhas++;
  console.log("FALHOU  execução: " + (e.stderr || e.message || e));
} finally {
  await desliga();
  if (falhas) {
    console.log("----- wrangler dev (últimas 40 linhas)");
    try { console.log(readFileSync(LOG, "utf8").split("\n").slice(-40).join("\n")); } catch { /* sem log */ }
  }
  rmSync(ESTADO, { recursive: true, force: true });
}
console.log(falhas ? `!! fumaça da API: ${falhas} falha(s)` : ">> fumaça da API: tudo ok");
process.exit(falhas ? 1 : 0);
