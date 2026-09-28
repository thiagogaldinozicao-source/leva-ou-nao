// Veredito de cosmético/pet/limpeza e informação de remédio (www/categorias.js).
// Esperado escrito pela regra (docstring de cada bloco em categorias.js), não copiado da saída.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const raiz = new URL("../", import.meta.url);
vm.runInThisContext(readFileSync(new URL("www/categorias.js", raiz), "utf8"), { filename: "www/categorias.js" });
const C = globalThis.Categorias;

const racao = (ing, extra = {}) => ({ _categoria: "pet", product_name: "Ração", ingredients_text_pt: ing, ...extra });
const tem = (lista, re) => lista.some(x => re.test(x));

test("categoria: sem _categoria ou desconhecida = alimento, e alimento não passa por aqui", () => {
  assert.equal(C.categoria({}), "alimento");
  assert.equal(C.categoria({ _categoria: "brinquedo" }), "alimento");
  assert.equal(C.avaliar({ ingredients_text_pt: "farinha, açúcar" }), null);
});

test("pet: 'vitamina E 110 UI' do enriquecimento não é corante E110", () => {
  const r = C.avaliar(racao("Frango, arroz, gordura de frango, vitamina E 110 UI, vitamina A"));
  assert.ok(!tem(r.pontos_ruins, /Corante/), r.pontos_ruins.join(" | "));
  // sem corante = 0 ponto = pode levar (E110 de verdade vale 2: teste abaixo). Não checa a lista pontos_bons: ela
  // mostra no máximo 4 itens (tela mínima) e aqui "Fórmula curtinha" + "1º é proteína" + açúcar + conservante enchem.
  assert.equal(r.veredito, "comprar");
});

test("pet: corante E110 de verdade conta como ressalva", () => {
  const r = C.avaliar(racao("Frango, arroz, corante E110, sal"));
  assert.ok(tem(r.pontos_ruins, /^Corante artificial/));
  assert.equal(r.veredito, "moderacao");
});

test("pet: xilitol em ração de cachorro → deixa na prateleira", () => {
  const r = C.avaliar(racao("Frango, arroz, xilitol", { product_name: "Petisco para cães" }));
  assert.equal(r.veredito, "evitar");
  assert.ok(r.pontos_ruins.includes("Xilitol: tóxico pra cão"));
});

test("pet: propilenoglicol pesa em gato e não conta em cão", () => {
  const gato = C.avaliar(racao("Frango, arroz, propilenoglicol", { product_name: "Ração para gatos" }));
  assert.equal(gato.veredito, "evitar");
  const cao = C.avaliar(racao("Frango, arroz, propilenoglicol", { product_name: "Ração para cães" }));
  assert.ok(!tem(cao.pontos_ruins, /Propilenoglicol/));
});

test("pet: milho em 1º + subproduto sem animal + BHA soma até deixar na prateleira", () => {
  const r = C.avaliar(racao("Milho integral moído, farinha de vísceras, gordura animal, BHA"));
  assert.equal(r.veredito, "evitar");
  assert.ok(r.pontos_ruins.includes("Cereal é o 1º ingrediente"));
  assert.ok(r.pontos_ruins.includes("Subproduto sem dizer de qual animal"));
});

test("pet: semente de uva (antioxidante) não é a fruta tóxica", () => {
  const r = C.avaliar(racao("Frango, arroz, extrato de semente de uva"));
  assert.ok(!tem(r.pontos_ruins, /[Tt]óxico/));
});

test("limpeza: formol = deixa na prateleira, sem repetir o nome e sem 'nada que chame atenção'", () => {
  const r = C.avaliar({ _categoria: "limpeza", product_name: "Desinfetante", ingredients_text_pt: "Água, formol, tensoativo" });
  assert.equal(r.veredito, "evitar");
  assert.ok(r.pontos_ruins.includes("Tem conservante que libera formol"), r.pontos_ruins.join(" | "));
  assert.ok(!/nada que chame/i.test(r.comentario));
});

test("limpeza: perfume + corante não vira 'deixa' por acúmulo", () => {
  const r = C.avaliar({ _categoria: "limpeza", ingredients_text_pt: "Água, tensoativo, perfume, corante" });
  assert.equal(r.veredito, "moderacao");
});

test("limpeza: fórmula limpa → pode levar, com o comentário padrão", () => {
  const r = C.avaliar({ _categoria: "limpeza", ingredients_text_pt: "Água, tensoativo aniônico, cloreto de sódio" });
  assert.equal(r.veredito, "comprar");
  assert.equal(r.comentario, "Nada que chame atenção na fórmula.");
});

test("cosmético sem ingredientes na base → 'sem dados', nunca 'pode levar'", () => {
  const r = C.avaliar({ _categoria: "cosmetico", product_name: "Xampu" });
  assert.equal(r.veredito, "moderacao");
  assert.ok(r.pontos_ruins.includes("A base não tem a lista de ingredientes desse produto"));
});

test("remédio: só informação, nunca veredito", () => {
  const r = C.avaliar({ _categoria: "remedio", product_name: "Dipirona 500 mg", principio_ativo: "dipirona",
    laboratorio: "Lab X", pmc: "12,34", pmc_icms: 0.18 });
  assert.equal(r.remedio, true);
  assert.equal(r.veredito, undefined);
  const [, valor] = r.linhas.find(([k]) => k === "Preço máximo");
  assert.equal(valor.replace(/\s/g, " "), "R$ 12,34 (ICMS 18%)"); // toLocaleString põe espaço fino/NBSP
});

test("fonte: crédito certo por categoria", () => {
  assert.equal(C.fonte("pet", "123").nome, "Open Pet Food Facts");
  assert.equal(C.fonte("xyz", "123").nome, "Open Food Facts");
});
