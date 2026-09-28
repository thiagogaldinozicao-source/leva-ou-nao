// "Tem melhor?" (www/troca.js): categoria do produto, URL da busca no Open Food Facts e escolha das trocas.
// Esperado escrito pela regra (o que o app promete), não copiado da saída. Sem rede: só funções puras.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const raiz = new URL("../", import.meta.url);
const fonteRegras = readFileSync(new URL("www/regras.js", raiz), "utf8");
vm.runInThisContext(fonteRegras, { filename: "www/regras.js" });
vm.runInThisContext(readFileSync(new URL("www/troca.js", raiz), "utf8"), { filename: "www/troca.js" });
const T = globalThis.Troca;

// Hierarquia real do Nescau no OFF (2026-09-28): do geral pro específico.
const NESCAU = ["en:beverages-and-beverages-preparations", "en:cocoa-and-its-products", "en:beverage-preparations",
  "en:cocoa-and-chocolate-powders", "en:instant-beverages", "en:instant-chocolate-powders"];

test("categoriaDe: a mais específica = último da hierarquia; sem categoria = null", () => {
  assert.equal(T.categoriaDe({ categories_hierarchy: NESCAU, categories_tags: ["en:outra"] }), "en:instant-chocolate-powders");
  assert.equal(T.categoriaDe({ categories_tags: ["en:beverages", "en:cocoa-and-chocolate-powders"] }), "en:cocoa-and-chocolate-powders");
  assert.equal(T.categoriaDe({ categories_hierarchy: [], categories_tags: ["en:snacks"] }), "en:snacks");
  for (const p of [null, undefined, {}, { categories_tags: [] }, { categories_tags: "en:x" }, { categories_tags: ["", "  "] }])
    assert.equal(T.categoriaDe(p), null);
});

test("categoriaDe: prefere tag en: (a busca entende), mesmo que a última seja de outro idioma", () => {
  assert.equal(T.categoriaDe({ categories_tags: ["en:beverages", "en:cocoa", "pt:achocolatado-em-po"] }), "en:cocoa");
  assert.equal(T.categoriaDe({ categories_tags: ["pt:doces", "pt:achocolatado"] }), "pt:achocolatado");   // só tem pt: => usa
});

test("categoriaPai: a anterior na hierarquia; a primeira não tem pai", () => {
  const p = { categories_hierarchy: NESCAU };
  assert.equal(T.categoriaPai(p, "en:instant-chocolate-powders"), "en:instant-beverages");
  assert.equal(T.categoriaPai(p, "en:instant-beverages"), "en:cocoa-and-chocolate-powders");
  assert.equal(T.categoriaPai(p, "en:beverages-and-beverages-preparations"), null);
  assert.equal(T.categoriaPai(p, "en:nao-esta-na-lista"), null);
  assert.equal(T.categoriaPai(p), "en:instant-beverages");   // sem cat = a mais específica
  assert.equal(T.categoriaPai({}, "en:x"), null);
});

test("urlBusca: OFF v2, só Brasil, mais escaneados primeiro, 40 por página", () => {
  const u = new URL(T.urlBusca("en:cocoa-and-chocolate-powders"));
  assert.equal(u.origin + u.pathname, "https://world.openfoodfacts.org/api/v2/search");
  assert.equal(u.searchParams.get("categories_tags"), "en:cocoa-and-chocolate-powders");
  assert.equal(u.searchParams.get("countries_tags"), "en:brazil");
  assert.equal(u.searchParams.get("page_size"), "40");
  assert.equal(u.searchParams.get("sort_by"), "unique_scans_n");
});

test("urlBusca: categoria com acento/símbolo vai codificada e volta igual; sem categoria = null", () => {
  const cat = "pt:achocolatado-em-pó&x=1";
  assert.equal(new URL(T.urlBusca(cat)).searchParams.get("categories_tags"), cat);
  for (const c of [null, undefined, "", "  ", 42]) assert.equal(T.urlBusca(c), null);
});

test("urlBusca: fields cobre tudo que analisarProduto lê + o que a linha mostra (guarda contra o motor mudar)", () => {
  const campos = new URL(T.urlBusca("en:snacks")).searchParams.get("fields").split(",");
  for (const f of ["code", "product_name", "product_name_pt", "brands"]) assert.ok(campos.includes(f), "falta " + f);
  // Lê o corpo de analisarProduto em regras.js: todo `d.campo` tem que estar em fields (imagem é só da tela do produto).
  const corpo = fonteRegras.slice(fonteRegras.indexOf("function analisarProduto"), fonteRegras.lastIndexOf("globalThis.Regras ="));
  const lidos = [...new Set([...corpo.matchAll(/\bd\.([a-z_0-9]+)/g)].map(m => m[1]))].filter(f => f !== "image_front_small_url");
  assert.ok(lidos.length >= 5, "regex não achou os campos do motor: " + lidos);
  for (const f of lidos) assert.ok(campos.includes(f), "regras.js lê " + f + " e a busca não pede");
});

const prod = (code, nome, marca, v) => ({ code, product_name_pt: nome, brands: marca, _v: v });
const porV = p => ({ veredito: p._v });

test("melhores: só 'Pode levar' (comprar), na ordem de popularidade em que chegou", () => {
  const lista = [prod("1", "A", "x", "evitar"), prod("2", "B", "x", "comprar"), prod("3", "C", "x", "moderacao"),
    prod("4", "D", "x", "comprar"), prod("5", "E", "x", undefined), prod("6", "F", "x", "comprar")];
  assert.deepEqual(T.melhores(lista, porV, "999").map(x => x.code), ["2", "4", "6"]);
});

test("melhores: formato {code, nome, marca, veredito}; marca = a primeira de brands", () => {
  const r = T.melhores([{ code: "789", product_name: "Cacau em pó", brands: " Garoto , Outra ", _v: "comprar" }], porV, "1");
  assert.deepEqual(r, [{ code: "789", nome: "Cacau em pó", marca: "Garoto", veredito: "comprar" }]);
});

test("melhores: exclui o próprio produto (código como número, ou com 0 na frente: UPC-A = EAN-13)", () => {
  const lista = [prod("7891000379585", "Nescau", "Nestlé", "comprar"), prod("2", "Outro", "y", "comprar")];
  assert.deepEqual(T.melhores(lista, porV, "7891000379585").map(x => x.code), ["2"]);
  assert.deepEqual(T.melhores(lista, porV, 7891000379585).map(x => x.code), ["2"]);
  assert.deepEqual(T.melhores(lista, porV, "07891000379585").map(x => x.code), ["2"]);
});

test("melhores: sem nome fica fora (product_name_pt, product_name, vazio, só espaço)", () => {
  const lista = [prod("1", "", "x", "comprar"), prod("2", "   ", "x", "comprar"), { code: "3", brands: "x", _v: "comprar" },
    { code: "4", product_name: "Só o nome em inglês", _v: "comprar" }];
  assert.deepEqual(T.melhores(lista, porV, "9").map(x => x.code), ["4"]);
});

test("melhores: duplicado (mesmo código, ou mesmo nome+marca) entra uma vez só", () => {
  const lista = [prod("1", "Cacau em pó", "Garoto", "comprar"), prod("1", "Outro nome", "z", "comprar"),
    prod("2", "CACAU EM PÓ", "garoto", "comprar"), prod("3", "Cacau em pó", "Mavalerio", "comprar")];
  assert.deepEqual(T.melhores(lista, porV, "9").map(x => x.code), ["1", "3"]);
});

test("melhores: respeita n (padrão 3) e para de analisar quando já tem", () => {
  const lista = Array.from({ length: 10 }, (_, i) => prod(String(100 + i), "P" + i, "m" + i, "comprar"));
  assert.equal(T.melhores(lista, porV, "9").length, 3);
  assert.equal(T.melhores(lista, porV, "9", 1).length, 1);
  assert.equal(T.melhores(lista, porV, "9", 5).length, 5);
  assert.equal(T.melhores(lista, porV, "9", 0).length, 3);    // n inválido volta ao padrão
  let chamadas = 0;
  T.melhores(lista, p => { chamadas++; return porV(p); }, "9", 2);
  assert.equal(chamadas, 2);
});

test("melhores: entrada torta não estoura (lista ausente, item nulo, analisar que lança)", () => {
  for (const l of [null, undefined, {}, "x", []]) assert.deepEqual(T.melhores(l, porV, "1"), []);
  const lista = [null, 5, prod("2", "B", "x", "comprar"), prod("3", "C", "x", "comprar")];
  const r = T.melhores(lista, p => { if (p.code === "2") throw new Error("boom"); return porV(p); }, "1");
  assert.deepEqual(r.map(x => x.code), ["3"]);
});

test("melhores com o motor de verdade: ultraprocessado sai, ingrediente único fica, sem ingredientes sai", () => {
  const lista = [
    { code: "1", product_name_pt: "Achocolatado", brands: "Marca", nova_group: 4, ingredients_text_pt: "Açúcar, cacau em pó, maltodextrina, aroma artificial, emulsificante lecitina de soja" },
    { code: "2", product_name_pt: "Cacau em pó", brands: "Garoto", nova_group: 1, ingredients_text_pt: "Cacau em pó" },
    { code: "3", product_name_pt: "Sem cadastro de ingredientes", brands: "Marca" },
  ];
  const r = T.melhores(lista, p => globalThis.analisarProduto(p, false), "999");
  assert.deepEqual(r.map(x => x.code), ["2"]);
});
