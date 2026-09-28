// Lighthouse (celular, throttling simulado = o padrão do LH) na página servida + "instalável" pelo próprio
// Chromium. O LH 12+ tirou a categoria PWA: o equivalente aqui é o que o Chrome usa pra oferecer "Instalar"
// (Page.getInstallabilityErrors / getAppManifest via CDP) + service worker ativo controlando a página.
// Piso = nota medida arredondada pra baixo (nunca < 90 em a11y e boas práticas). Relatório JSON+HTML em E2E_OUT.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import os from "node:os";
import path from "node:path";
import { chromium } from "playwright-core";
import lighthouse from "lighthouse";
import { sobe } from "./servidor.mjs";

const OUT = process.env.E2E_OUT || path.join(os.tmpdir(), "leva-e2e");
mkdirSync(OUT, { recursive: true });
// Medido em 2026-09-28 na VM tibiatest (Chromium 153, LH 13.5): perf 99, a11y 100, BP 100, SEO 100.
// Performance com folga (throttling simulado varia com a carga da VM). Subiu? suba o piso junto; caiu = regressão.
const PISO = { performance: 90, accessibility: 100, "best-practices": 100, seo: 100 };

const portaLivre = () => new Promise((ok, erro) => { const s = createServer().listen(0, "127.0.0.1", () => { const p = s.address().port; s.close(() => ok(p)); }).on("error", erro); });

let browser, srv, port;
before(async () => {
  port = await portaLivre();
  // channel "chromium" = Chromium completo em headless novo (o headless-shell não tem o instalador de PWA).
  [browser, srv] = await Promise.all([chromium.launch({ channel: "chromium", args: [`--remote-debugging-port=${port}`] }), sobe()]);
});
after(async () => { await browser?.close(); await srv?.desce(); });

test("Lighthouse celular: a11y, boas práticas, SEO e performance acima do piso", { timeout: 120000 }, async () => {
  const r = await lighthouse(srv.url, {
    port, output: ["json", "html"], logLevel: "error",
    onlyCategories: ["performance", "accessibility", "best-practices", "seo"],
  });
  assert.ok(r && r.lhr, "Lighthouse não devolveu resultado");
  const [json, html] = r.report;
  writeFileSync(path.join(OUT, "lighthouse.json"), json);
  writeFileSync(path.join(OUT, "lighthouse.html"), html);
  const notas = Object.fromEntries(Object.entries(r.lhr.categories).map(([k, c]) => [k, Math.round((c.score ?? 0) * 100)]));
  // O que perdeu ponto (score < 1, com peso), por categoria: vai pro log pra ninguém precisar abrir o HTML.
  const perdas = [];
  for (const [k, c] of Object.entries(r.lhr.categories))
    for (const ref of c.auditRefs) {
      const a = r.lhr.audits[ref.id];
      if (ref.weight > 0 && a && a.score !== null && a.score < 1) perdas.push(`${k}/${ref.id}=${a.score}${a.displayValue ? " (" + a.displayValue + ")" : ""}`);
    }
  console.log(">> lighthouse " + JSON.stringify(notas) + (r.lhr.runWarnings?.length ? " avisos: " + r.lhr.runWarnings.join(" | ") : ""));
  if (perdas.length) console.log(">> lighthouse perdeu ponto em: " + perdas.join(", "));
  console.log(">> relatório: " + path.join(OUT, "lighthouse.html"));
  for (const [k, min] of Object.entries(PISO)) assert.ok(notas[k] >= min, `${k} = ${notas[k]} < piso ${min}`);
});

test("instalável: manifesto sem erro, Chrome sem objeção de instalação, SW controlando", { timeout: 60000 }, async t => {
  // Contexto do newContext() é anônimo e o Chrome não instala PWA em anônimo ('in-incognito'): perfil de verdade.
  const dir = mkdtempSync(path.join(os.tmpdir(), "leva-perfil-"));
  const ctx = await chromium.launchPersistentContext(dir, { channel: "chromium" });
  t.after(async () => { await ctx.close(); rmSync(dir, { recursive: true, force: true }); });
  const page = await ctx.newPage();
  await page.goto(srv.url, { waitUntil: "load" });
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload({ waitUntil: "load" });
  assert.equal(await page.evaluate(() => !!navigator.serviceWorker.controller), true, "SW controla a página depois do reload");
  const cdp = await ctx.newCDPSession(page);
  const man = await cdp.send("Page.getAppManifest");
  assert.deepEqual(man.errors, [], "erro no manifest.json");
  const { installabilityErrors } = await cdp.send("Page.getInstallabilityErrors");
  console.log(">> instalável: " + (installabilityErrors.length ? JSON.stringify(installabilityErrors) : "sim (sem objeção do Chrome)"));
  assert.deepEqual(installabilityErrors, [], "Chrome não oferece Instalar");
});
