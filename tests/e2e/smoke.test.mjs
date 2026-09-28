// Gate de navegador: clica nos botões de verdade num Chromium headless, com www/ servido por um servidor
// efêmero (servidor.mjs) e o Open Food Facts mockado (mock-off.mjs). Roda na VM: `scripts/vm-run.sh e2e`.
// Cada teste = contexto novo (localStorage/sessionStorage limpos); os testes do describe rodam juntos.
// Todo teste termina exigindo: zero erro de console, zero exceção na página, zero violação de CSP (a <meta>).
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { chromium } from "playwright-core";
import { sobe } from "./servidor.mjs";
import { mockOff, fx } from "./mock-off.mjs";

const OUT = process.env.E2E_OUT || path.join(os.tmpdir(), "leva-e2e");
mkdirSync(OUT, { recursive: true });
const CEL = { viewport: { width: 375, height: 740 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 };
const PC = { viewport: { width: 1440, height: 900 } };
const T = { timeout: 30000 };
const AXE = createRequire(import.meta.url).resolve("axe-core/axe.min.js");

let browser, srv;
before(async () => { [browser, srv] = await Promise.all([chromium.launch(), sobe()]); });
after(async () => { await browser?.close(); await srv?.desce(); });

// Contexto + página com os vigias de console/CSP. `permitido` = regex de erro de console esperado NAQUELE teste.
async function abre(t, { ctxOpts = CEL, permitido = null, busca503 = 0, url = srv.url } = {}) {
  const ctx = await browser.newContext({ locale: "pt-BR", ...ctxOpts });
  const off = await mockOff(ctx, { busca503 });
  const page = await ctx.newPage();
  const erros = [], externas = [];
  page.on("console", m => {
    if (m.type() !== "error") return;
    const txt = `${m.text()} @ ${m.location().url || "?"}`;
    if (!(permitido && permitido.test(txt))) erros.push(txt);
  });
  page.on("pageerror", e => erros.push("pageerror: " + e.message));
  page.on("request", r => { const h = new URL(r.url()).hostname; if (!/^(127\.0\.0\.1|world\.open\w+facts\.org)$/.test(h) && !/^(data|blob):/.test(r.url())) externas.push(r.url()); });
  await page.addInitScript(() => {
    window.__csp = [];
    document.addEventListener("securitypolicyviolation", e => window.__csp.push(`${e.violatedDirective} ${e.blockedURI}`));
  });
  t.after(async () => { await ctx.close(); });
  await page.goto(url, { waitUntil: "load" });
  const fim = async () => {
    const csp = await page.evaluate(() => window.__csp).catch(() => []);
    assert.deepEqual(csp, [], "violação de CSP");
    assert.deepEqual(erros, [], "erro no console/página");
    assert.deepEqual(externas, [], "pedido pra fora (tudo externo tem que estar mockado)");
    assert.deepEqual(off.outras, [], "URL do OFF sem mock");
  };
  return { ctx, page, off, fim };
}

const slotOk = (page, k) => page.waitForFunction(k => {
  const nm = document.querySelector(`[data-found="${k}"] .nm`);
  return nm && nm.textContent !== "Buscando…";
}, k);
async function digita(page, code, k = "A") {
  await page.fill(`[data-code="${k}"]`, code);
  await page.click(`[data-ok="${k}"]`);
  await slotOk(page, k);
}
async function analisa(page, code) {
  await digita(page, code);
  await page.waitForFunction(() => !document.querySelector("#go").disabled);
  await page.click("#go");
  await page.locator("#result:not(.hidden) .card").first().waitFor();
  return page.locator("#result .stamp").first().textContent();
}
const outro = page => page.click("#result .again");
const textoResult = page => page.locator("#result").innerText();

describe("Leva ou não? no navegador", { concurrency: true }, () => {
  it("digitar código → Analisar → veredito certo (e Analisar outro volta)", T, async t => {
    // O OFF responde 404 pra produto que não existe e o Chrome loga isso sozinho (não é erro do app).
    const { page, fim } = await abre(t, { permitido: /status of 404 .*\/api\/v2\/product\/7890000000000\.json/ });
    assert.equal(await page.title(), "Leva ou não?");
    assert.equal(await page.locator("#go").isDisabled(), true, "Analisar começa desligado");
    assert.equal(await analisa(page, fx.nescau.code), "Deixa na prateleira");
    assert.match(await textoResult(page), /Nescau 2\.0/);
    assert.match(await textoResult(page), /Ultraprocessado \(NOVA 4\)/);
    await outro(page);
    assert.equal(await page.locator("#result").isHidden(), true);
    // Enter no campo também busca
    await page.fill('[data-code="A"]', fx["iogurte-natural"].code);
    await page.press('[data-code="A"]', "Enter");
    await slotOk(page, "A");
    await page.click("#go");
    await page.locator("#result:not(.hidden) .card").waitFor();
    assert.equal(await page.locator("#result .stamp").textContent(), "Pode levar");
    // código curto: aviso, nada quebra
    await outro(page);
    await page.fill('[data-code="A"]', "123");
    await page.click('[data-ok="A"]');
    assert.match(await page.locator("#status").textContent(), /Código incompleto/);
    // produto que não existe em nenhuma base: "não cadastrado" + painel de leitura do rótulo
    await digita(page, "7890000000000");
    assert.match(await page.locator('[data-found="A"]').innerText(), /não cadastrado/);
    assert.equal(await page.locator("#go").isDisabled(), true);
    await fim();
  });

  it("Comparar 2: iogurte natural × com açúcar → leva o A", T, async t => {
    const { page, fim } = await abre(t);
    await page.click("#tabTwo");
    assert.equal(await page.locator("#tabTwo").getAttribute("aria-pressed"), "true");
    assert.equal(await page.locator("#slotB").isVisible(), true);
    await digita(page, fx["iogurte-natural"].code, "A");
    await digita(page, fx["iogurte-acucar"].code, "B");
    assert.equal(await page.locator("#go").textContent(), "Comparar");
    await page.click("#go");
    await page.locator("#result:not(.hidden) .winner").waitFor();
    assert.equal(await page.locator("#result .crown").textContent(), "Leva o A");
    const stamps = await page.locator("#result .vs .stamp").allTextContents();
    assert.deepEqual(stamps, ["Pode levar", "Deixa na prateleira"]);
    await page.click("#tabOne");
    assert.equal(await page.locator("#slotB").isVisible(), false);
    await fim();
  });

  it("perfis 🌾🥛🍬 ligam, persistem após reload e mudam o veredito", T, async t => {
    const { page, fim } = await abre(t);
    assert.equal(await analisa(page, fx["iogurte-natural"].code), "Pode levar");
    await outro(page);
    for (const id of ["gluten", "lactose", "acucar"]) await page.click(`label:has([data-perfil="${id}"])`);
    await page.reload({ waitUntil: "load" });
    const marcados = await page.$$eval("[data-perfil]", l => l.map(i => [i.dataset.perfil, i.checked]));
    assert.deepEqual(marcados, [["gluten", true], ["lactose", true], ["acucar", true]], "perfis voltam ligados depois do reload");
    assert.equal(await analisa(page, fx["iogurte-natural"].code), "Deixa na prateleira", "leite com 🥛 ligado");
    const txt = await textoResult(page);
    assert.match(txt, /🥛 Tem lactose/);
    assert.match(txt, /🌾 /);
    assert.match(txt, /🍬 /);
    // desliga tudo: volta a Pode levar
    await outro(page);
    for (const id of ["gluten", "lactose", "acucar"]) await page.click(`label:has([data-perfil="${id}"])`);
    assert.equal(await analisa(page, fx["iogurte-natural"].code), "Pode levar");
    assert.doesNotMatch(await textoResult(page), /Tem lactose/);
    await fim();
  });

  it("modo bebê: liga, persiste e decide (papinha serve, Nescau não)", T, async t => {
    const { page, fim } = await abre(t);
    await page.click("label.row:has(#baby)");   // a linha inteira liga (alvo de toque), não só o trilho
    assert.equal(await page.locator("#baby").isChecked(), true);
    await page.reload({ waitUntil: "load" });
    assert.equal(await page.locator("#baby").isChecked(), true, "modo bebê volta ligado");
    assert.equal(await analisa(page, fx.papinha.code), "Pode levar");
    assert.match(await textoResult(page), /👶 Serve pro bebê/);
    await outro(page);
    assert.equal(await analisa(page, fx.nescau.code), "Deixa na prateleira");
    assert.match(await textoResult(page), /👶 Não indicado pro bebê/);
    await fim();
  });

  it("🔁 Tem melhor?: 503 sem CORS é retentado, lista ≤3 Pode levar e o toque abre o veredito da troca", T, async t => {
    const { page, off, fim } = await abre(t, { busca503: 1, permitido: /CORS policy|net::ERR_FAILED|status of 503/ });
    assert.equal(await analisa(page, fx.nescau.code), "Deixa na prateleira");
    const b = page.locator("#result .trocab");
    assert.equal(await b.textContent(), "🔁 Tem melhor?");
    await b.click();
    await page.locator("#result .trocal").first().waitFor();
    assert.equal(off.busca, 2, "a 1ª busca levou 503 sem CORS e a 2ª (retentativa sozinha) passou");
    assert.equal(off.taxonomia, 1);
    const linhas = await page.locator("#result .trocal").allInnerTexts();
    assert.ok(linhas.length >= 1 && linhas.length <= 3, `1..3 trocas (veio ${linhas.length})`);
    assert.equal(linhas.length, 3, "4 aprovados na busca → teto de 3");
    for (const l of linhas) assert.match(l, /Pode levar/);
    assert.ok(!linhas.some(l => /Toddy|Nescau/.test(l)), "nem o próprio nem o reprovado entram");
    assert.match(linhas[0], /Iogurte natural/);
    await page.locator("#result .trocal").first().click();
    await page.waitForFunction(() => /Iogurte natural/.test(document.querySelector("#result:not(.hidden) .pname")?.textContent || ""));
    assert.equal(await page.locator("#result .stamp").textContent(), "Pode levar");
    await fim();
  });

  it("sem rede: 'Sem conexão agora.' no Tem melhor? e o botão segue usável; produto sem rede também se recupera", T, async t => {
    const { ctx, page, fim } = await abre(t, { permitido: /net::ERR_INTERNET_DISCONNECTED|net::ERR_FAILED/ });
    assert.equal(await analisa(page, fx.nescau.code), "Deixa na prateleira");
    await ctx.setOffline(true);
    const b = page.locator("#result .trocab");
    await b.click();
    await page.locator("#result .troca p").waitFor();
    assert.equal(await page.locator("#result .troca p").textContent(), "Sem conexão agora.");
    assert.equal(await b.isEnabled(), true, "botão volta a funcionar");
    assert.equal(await b.textContent(), "🔁 Tem melhor?");
    await ctx.setOffline(false);
    await b.click();
    await page.locator("#result .trocal").first().waitFor();
    assert.equal(await page.locator("#result .troca p").count(), 0, "aviso some quando a busca volta");
    // busca de produto sem rede: slot diz "Sem conexão"; com a rede de volta, o mesmo código acha
    await outro(page);
    await page.route(/\/api\/v2\/product\//, r => r.abort("internetdisconnected"));
    await digita(page, fx.agua.code);
    assert.match(await page.locator('[data-found="A"]').innerText(), /Sem conexão/);
    await page.unroute(/\/api\/v2\/product\//);
    await page.click('[data-found="A"] [aria-label="Tentar de novo"]');   // ↻ no próprio cartão: 1 toque, sem redigitar
    await page.waitForFunction(() => /Água mineral/.test(document.querySelector('[data-found="A"]')?.innerText || ""));
    await page.waitForFunction(() => !document.querySelector("#go").disabled);
    await page.click("#go");
    await page.locator("#result:not(.hidden) .card").first().waitFor();
    assert.equal(await page.locator("#result .stamp").first().textContent(), "Pode levar");
    await fim();
  });

  it("histórico grava, reabre depois do reload e limpa", T, async t => {
    const { page, fim } = await abre(t);
    assert.equal(await page.locator("#hist").isHidden(), true, "sem histórico: seção escondida");
    await analisa(page, fx.nescau.code);
    await outro(page);
    await analisa(page, fx.agua.code);
    const antes = await page.locator("#histList li").allInnerTexts();
    assert.equal(antes.length, 2);
    assert.match(antes[0], /Água mineral/);
    assert.match(antes[0], /Pode levar/);
    assert.match(antes[1], /Nescau 2\.0/);
    assert.match(antes[1], /Deixa na prateleira/);
    await page.reload({ waitUntil: "load" });
    assert.equal(await page.locator("#hist").isVisible(), true);
    assert.deepEqual(await page.locator("#histList li").allInnerTexts(), antes, "histórico igual depois do reload");
    await page.click("#clearHist");
    assert.equal(await page.locator("#hist").isHidden(), true);
    await fim();
  });

  for (const [nome, ctxOpts] of [["375", CEL], ["1440", PC]]) for (const tema of ["dark", "light"]) {
    it(`tela ${nome}px tema ${tema}: sem rolagem lateral, veredito legível, nada fora da tela`, T, async t => {
      const { page, fim } = await abre(t, { ctxOpts: { ...ctxOpts, colorScheme: tema } });
      await page.emulateMedia({ colorScheme: tema });
      assert.equal(await analisa(page, fx.nescau.code), "Deixa na prateleira");
      await page.locator("#result .trocab").waitFor();
      const m = await page.evaluate(() => {
        const w = document.documentElement.clientWidth;
        const fora = [...document.querySelectorAll("button, input:not([hidden]), a, .stamp, h1")]
          .filter(e => e.offsetParent !== null)
          .map(e => [e, e.getBoundingClientRect()])
          .filter(([, r]) => r.width > 0 && (r.left < -1 || r.right > w + 1))
          .map(([e]) => e.outerHTML.slice(0, 80));
        // color-mix() sai do getComputedStyle como "color(srgb r g b / a)" em 0..1, não rgb() em 0..255
        const rgb = s => { const n = (s.match(/[\d.]+/g) || []).slice(0, 4).map(Number); return s.startsWith("color(srgb") ? [...n.slice(0, 3).map(v => v * 255), ...n.slice(3)] : n; };
        const fundo = e => { for (; e; e = e.parentElement) { const c = rgb(getComputedStyle(e).backgroundColor); if (c.length < 4 || c[3] > 0) return c; } return [255, 255, 255]; };
        const lum = ([r, g, b]) => [r, g, b].map(v => (v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4).reduce((s, v, i) => s + v * [0.2126, 0.7152, 0.0722][i], 0);
        const st = document.querySelector("#result .stamp");
        const a = lum(rgb(getComputedStyle(st).color)), b = lum(fundo(st));
        return { rolagem: document.documentElement.scrollWidth - w, fora, contraste: (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05) };
      });
      await page.screenshot({ path: path.join(OUT, `tela-${nome}-${tema}.png`), fullPage: true });
      // axe-core (o motor do a11y do Lighthouse) na tela de RESULTADO, que o Lighthouse não vê (ele só abre a página).
      await page.addScriptTag({ path: AXE });
      const axe = await page.evaluate(() => axe.run(document, { runOnly: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "best-practice"] })
        .then(r => r.violations.map(v => ({ id: v.id, impacto: v.impact, alvos: v.nodes.map(n => n.target.join(" ")).slice(0, 5) }))));
      writeFileSync(path.join(OUT, `axe-${nome}-${tema}.json`), JSON.stringify(axe, null, 1));
      if (axe.length) console.log(`>> axe ${nome}/${tema}: ` + axe.map(v => `${v.id}(${v.impacto}) ${v.alvos.join(" | ")}`).join("; "));
      assert.ok(m.rolagem <= 0, `rolagem lateral de ${m.rolagem}px`);
      assert.deepEqual(m.fora, [], "elemento fora da tela");
      assert.ok(m.contraste >= 3, `contraste do selo ${m.contraste.toFixed(2)} < 3`);
      assert.deepEqual(axe, [], "violação de acessibilidade (axe) na tela de resultado"); // medido 2026-09-28: zero
      await fim();
    });
  }

  it("service worker instala mesmo com 1 arquivo do SHELL em erro e o app abre com o servidor fora do ar", T, async t => {
    const s2 = await sobe({ falhar: p => p === "/icons/icon-512.png" ? 500 : null });
    t.after(() => s2.desce().catch(() => {}));
    const { page, fim } = await abre(t, { url: s2.url, permitido: /icon-512\.png|status of 500/ });
    const sw = await page.evaluate(async () => {
      const reg = await navigator.serviceWorker.ready, w = reg.active;   // ready = já é o ativo, mas pode estar "activating"
      if (w.state !== "activated") await new Promise(ok => w.addEventListener("statechange", () => w.state === "activated" && ok()));
      const nomes = await caches.keys();
      const c = await caches.open(nomes.find(n => n.startsWith("levaounao-")));
      return { estado: reg.active && reg.active.state, cache: (await c.keys()).map(r => new URL(r.url).pathname) };
    });
    assert.equal(sw.estado, "activated");
    assert.ok(sw.cache.includes("/index.html") && sw.cache.includes("/lib/zxing_reader.wasm"), "shell no cache: " + sw.cache.join(" "));
    assert.ok(!sw.cache.includes("/icons/icon-512.png"), "o que falhou fica fora, o resto entra");
    await page.waitForFunction(() => !!navigator.serviceWorker.controller);
    await s2.desce();
    await page.reload({ waitUntil: "load" });
    assert.equal(await page.locator("h1").textContent(), "Leva ou não?");
    assert.equal(await analisa(page, fx.agua.code), "Pode levar", "sem o servidor, o shell do cache ainda analisa");
    await fim();
  });
});
