// Motor de regras (www/regras.js) contra produtos reais no formato do Open Food Facts.
// Esperado = o veredito que o motor dá hoje. Mudou uma regra de propósito? Atualize aqui junto.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const raiz = new URL("../", import.meta.url);
// regras.js é script clássico (igual no navegador): roda no contexto global e deixa globalThis.Regras.
vm.runInThisContext(readFileSync(new URL("www/regras.js", raiz), "utf8"), { filename: "www/regras.js" });
const { ingredientesDe, avaliar, comparar, analisarProduto } = globalThis.Regras;

const fx = nome => JSON.parse(readFileSync(new URL(`tests/fixtures/${nome}.json`, raiz), "utf8"));
const tem = (lista, re) => lista.some(x => re.test(x));

test("Nescau: ultraprocessado com açúcar na frente → deixa na prateleira", () => {
  const r = analisarProduto(fx("nescau"), false);
  assert.equal(r.veredito, "evitar");
  assert.equal(r.produto, "Nescau 2.0 · Nestlé");
  assert.ok(r.pontos_ruins.includes("Ultraprocessado (NOVA 4)"));
  assert.ok(r.pontos_ruins.includes("Açúcar/xarope entre os primeiros ingredientes"));
  assert.ok(tem(r.pontos_ruins, /^Muito açúcar: 75 g/));
});

test("Toddy: aroma idêntico ao natural conta como artificial → deixa na prateleira", () => {
  const r = analisarProduto(fx("toddy"), false);
  assert.equal(r.veredito, "evitar");
  assert.equal(r.produto, "Achocolatado em pó Toddy"); // marca já está no nome: não repete
  assert.ok(r.pontos_ruins.includes("Aromatizante artificial"));
});

test("iogurte natural: leite + fermento → pode levar", () => {
  const r = analisarProduto(fx("iogurte-natural"), false);
  assert.equal(r.veredito, "comprar");
  assert.deepEqual(r.pontos_ruins, []);
  assert.ok(r.pontos_bons.includes("Alimento in natura ou minimamente processado (NOVA 1)"));
});

test("iogurte com açúcar: açúcar em 2º + NOVA 4 → deixa na prateleira", () => {
  const r = analisarProduto(fx("iogurte-acucar"), false);
  assert.equal(r.veredito, "evitar");
  assert.ok(r.pontos_ruins.includes("Açúcar/xarope entre os primeiros ingredientes"));
  assert.ok(r.pontos_ruins.includes("Tem corante (parece natural)"));
});

test("suco de caixa: 6% de fruta, açúcar e conservante → deixa na prateleira", () => {
  const r = analisarProduto(fx("suco-caixa"), false);
  assert.equal(r.veredito, "evitar");
  assert.ok(r.pontos_ruins.includes("Pouquíssima fruta (6%)"));
  assert.ok(r.pontos_ruins.includes("Tem conservante (sorbato)"));
});

test("refrigerante zero: adoçante, corante caramelo IV e benzoato → deixa na prateleira", () => {
  const r = analisarProduto(fx("refrigerante-zero"), false);
  assert.equal(r.veredito, "evitar");
  assert.ok(tem(r.pontos_ruins, /^Adoçante artificial \(.*aspartame/));
  assert.ok(tem(r.pontos_ruins, /^Corante artificial \(caramelo iv\)/));
  assert.ok(r.pontos_bons.includes("Sem açúcar adicionado"));
});

test("água mineral → pode levar", () => {
  const r = analisarProduto(fx("agua"), false);
  assert.equal(r.veredito, "comprar");
  assert.deepEqual(r.pontos_ruins, []);
});

test("biscoito recheado: açúcar, gordura vegetal, NOVA 4 → deixa na prateleira", () => {
  const r = analisarProduto(fx("biscoito-recheado"), false);
  assert.equal(r.veredito, "evitar");
  assert.ok(r.pontos_ruins.includes("Gordura vegetal/palma"));
  assert.ok(tem(r.pontos_ruins, /^Gordura saturada alta: 9 g/));
});

test("papinha de fruta no modo bebê → pode levar e serve pro bebê", () => {
  const r = analisarProduto(fx("papinha"), true);
  assert.equal(r.veredito, "comprar");
  assert.equal(r.bebe.serve, true);
  assert.equal(analisarProduto(fx("papinha"), false).bebe, undefined);
});

test("modo bebê: Nescau não serve", () => {
  const r = analisarProduto(fx("nescau"), true);
  assert.equal(r.veredito, "evitar");
  assert.equal(r.bebe.serve, false);
});

test("modo bebê endurece: 2 pontos é moderação pro adulto e evitar pro bebê", () => {
  const rotulo = "Ingredientes: leite integral, açúcar, fermento lácteo";
  assert.deepEqual(ingredientesDe(rotulo).lista, ["leite integral", "acucar", "fermento lacteo"]);
  const adulto = avaliar(rotulo, false), bebe = avaliar(rotulo, true);
  assert.equal(adulto._pts, 2);
  assert.equal(adulto.veredito, "moderacao");
  assert.equal(bebe.veredito, "evitar");
});

test("foto sem lista de ingredientes → ilegível, sem veredito", () => {
  const r = avaliar("foto borrada xyz", false);
  assert.equal(r.legivel, false);
  assert.equal(r.veredito, undefined);
});

test("comparar 2: iogurte natural ganha do iogurte com açúcar, dos dois lados", () => {
  const nat = analisarProduto(fx("iogurte-natural"), false), acu = analisarProduto(fx("iogurte-acucar"), false);
  const c = comparar(nat, acu, false);
  assert.equal(c.melhor, "a");
  assert.equal(c.a.veredito, "comprar");
  assert.equal(c.b.veredito, "evitar");
  assert.equal(c.diferencas[0], "O outro: ultraprocessado (NOVA 4)");
  assert.equal(c.bebe, null);
  assert.equal(comparar(acu, nat, false).melhor, "b");
});

test("comparar 2 no modo bebê e empate", () => {
  const c = comparar(analisarProduto(fx("papinha"), true), analisarProduto(fx("nescau"), true), true);
  assert.equal(c.melhor, "a");
  assert.equal(c.bebe, "O escolhido serve pro bebê.");
  const agua = analisarProduto(fx("agua"), false);
  const e = comparar(agua, agua, false);
  assert.equal(e.melhor, "empate");
  assert.deepEqual(e.diferencas, []);
});
