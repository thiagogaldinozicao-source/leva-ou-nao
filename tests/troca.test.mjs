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

// Nescau (7891000352175) como o OFF entrega em 2026-09-28: categories_tags na ordem do OFF, que MISTURA ramos
// (termina em en:sweetened-beverages, do ramo bebidas, e trouxe "Pepsi cola" como troca).
const NESCAU_TAGS = ["en:beverages-and-beverages-preparations", "en:plant-based-foods-and-beverages", "en:beverages", "en:plant-based-foods",
  "en:dairies", "en:fermented-foods", "en:fermented-milk-products", "en:snacks", "en:cereals-and-potatoes", "en:sweet-snacks",
  "en:cereals-and-their-products", "en:cocoa-and-its-products", "en:beverage-preparations", "en:instant-beverages",
  "en:cocoa-and-chocolate-powders", "en:instant-chocolate-powders", "en:sweetened-beverages", "pt:Achocolatado-em-po", "pt:Bebidas achocolatadas"];
const NESCAU = { categories_tags: NESCAU_TAGS, categories_hierarchy: NESCAU_TAGS };
// Resposta real de /api/v2/taxonomy?tagtype=categories&tags=<os en: acima>&fields=parents (sem `parents` = raiz).
const PAIS_NESCAU = {
  "en:beverage-preparations": { parents: ["en:beverages-and-beverages-preparations"] }, "en:beverages": { parents: ["en:beverages-and-beverages-preparations"] },
  "en:beverages-and-beverages-preparations": {}, "en:cereals-and-potatoes": { parents: ["en:plant-based-foods"] },
  "en:cereals-and-their-products": { parents: ["en:cereals-and-potatoes"] }, "en:cocoa-and-chocolate-powders": { parents: ["en:cocoa-and-its-products"] },
  "en:cocoa-and-its-products": {}, "en:dairies": {}, "en:fermented-foods": {}, "en:fermented-milk-products": { parents: ["en:dairies", "en:fermented-foods"] },
  "en:instant-beverages": { parents: ["en:beverage-preparations"] }, "en:instant-chocolate-powders": { parents: ["en:cocoa-and-chocolate-powders", "en:instant-beverages"] },
  "en:plant-based-foods": { parents: ["en:plant-based-foods-and-beverages"] }, "en:plant-based-foods-and-beverages": {}, "en:snacks": {},
  "en:sweet-snacks": { parents: ["en:snacks"] }, "en:sweetened-beverages": { parents: ["en:beverages"] }
};

test("categoriaDe: só diz se TEM categoria (botão); sem categoria = null; prefere tag en:", () => {
  assert.equal(T.categoriaDe({ categories_tags: ["en:beverages", "en:cocoa", "pt:achocolatado-em-po"] }), "en:cocoa");
  assert.equal(T.categoriaDe({ categories_tags: ["pt:doces", "pt:achocolatado"] }), "pt:achocolatado");   // só tem pt: => usa
  for (const p of [null, undefined, {}, { categories_tags: [] }, { categories_tags: "en:x" }, { categories_tags: ["", "  "] }])
    assert.equal(T.categoriaDe(p), null);
});

test("escolheCategoria: Nescau = en:instant-chocolate-powders (não o último tag en:sweetened-beverages, que trouxe a Pepsi)", () => {
  assert.equal(NESCAU_TAGS.filter(t => t.startsWith("en:")).pop(), "en:sweetened-beverages");   // a armadilha do último tag
  assert.equal(T.escolheCategoria(NESCAU, PAIS_NESCAU), "en:instant-chocolate-powders");
  assert.equal(T.escolheCategoria({ categories_tags: NESCAU_TAGS }, PAIS_NESCAU), "en:instant-chocolate-powders");
});

test("escolheCategoria: a ordem dos tags não muda a escolha (ancestrais decidem); empate = o mais à direita", () => {
  const inv = { categories_tags: NESCAU_TAGS.slice().reverse() };
  assert.equal(T.escolheCategoria(inv, PAIS_NESCAU), "en:instant-chocolate-powders");
  // 2 raízes sem parentesco (0 ancestrais cada): fica a da direita
  assert.equal(T.escolheCategoria({ categories_tags: ["en:snacks", "en:dairies"] }, PAIS_NESCAU), "en:dairies");
  // sem taxonomia (vazia/ausente) todos empatam em 0 => o mais à direita
  for (const pais of [{}, null, undefined]) assert.equal(T.escolheCategoria({ categories_tags: ["en:a", "en:b", "en:c"] }, pais), "en:c");
});

test("escolheCategoria: só conta ancestral que está na lista do produto; ciclo na taxonomia não trava", () => {
  const pais = { "en:filho": { parents: ["en:fora-da-lista"] }, "en:outro": { parents: ["en:raiz"] }, "en:raiz": {} };
  assert.equal(T.escolheCategoria({ categories_tags: ["en:raiz", "en:outro", "en:filho"] }, pais), "en:outro");   // filho: 0 na lista; outro: 1 (raiz)
  const ciclo = { "en:a": { parents: ["en:b"] }, "en:b": { parents: ["en:a"] } };
  assert.equal(T.escolheCategoria({ categories_tags: ["en:a", "en:b"] }, ciclo), "en:b");
  for (const p of [null, undefined, {}, { categories_tags: [] }]) assert.equal(T.escolheCategoria(p, PAIS_NESCAU), null);
});

test("categoriaPai: o pai (taxonomia) que está na lista e tem mais ancestrais; sem pai na lista = null", () => {
  // pais de instant-chocolate-powders: cocoa-and-chocolate-powders (1 ancestral na lista) e instant-beverages (2) => o segundo
  assert.equal(T.categoriaPai(NESCAU, "en:instant-chocolate-powders", PAIS_NESCAU), "en:instant-beverages");
  assert.equal(T.categoriaPai(NESCAU, "en:instant-beverages", PAIS_NESCAU), "en:beverage-preparations");
  assert.equal(T.categoriaPai(NESCAU, "en:beverages-and-beverages-preparations", PAIS_NESCAU), null);   // raiz
  assert.equal(T.categoriaPai(NESCAU, "en:nao-esta-na-lista", PAIS_NESCAU), null);
  assert.equal(T.categoriaPai(NESCAU, undefined, PAIS_NESCAU), "en:instant-beverages");   // sem cat = a escolhida
  assert.equal(T.categoriaPai({}, "en:x", PAIS_NESCAU), null);
  assert.equal(T.categoriaPai(NESCAU, "en:instant-chocolate-powders", {}), null);         // sem taxonomia não inventa pai
  // pai fora da lista do produto não vale (a lista do produto é o universo)
  assert.equal(T.categoriaPai({ categories_tags: ["en:filho"] }, "en:filho", { "en:filho": { parents: ["en:fora"] } }), null);
});

test("urlTaxonomia: tags en: do produto separados por vírgula, só `parents`; sem tag = null", () => {
  const u = new URL(T.urlTaxonomia(NESCAU));
  assert.equal(u.origin + u.pathname, "https://world.openfoodfacts.org/api/v2/taxonomy");
  assert.equal(u.searchParams.get("tagtype"), "categories");
  assert.equal(u.searchParams.get("fields"), "parents");
  assert.equal(u.searchParams.get("include_parents"), "0");
  assert.equal(u.searchParams.get("include_children"), "0");
  assert.deepEqual(u.searchParams.get("tags").split(","), NESCAU_TAGS.filter(t => t.startsWith("en:")));   // sem os pt:
  for (const p of [null, undefined, {}, { categories_tags: [] }]) assert.equal(T.urlTaxonomia(p), null);
  assert.equal(new URL(T.urlTaxonomia({ categories_tags: ["en:a&b=1"] })).searchParams.get("tags"), "en:a&b=1");   // símbolo vai codificado
});

test("index.html: trocaAcha escolhe a categoria pela taxonomia e não cai no último tag se ela falhar", () => {
  const html = readFileSync(new URL("www/index.html", raiz), "utf8");
  const corpo = html.slice(html.indexOf("async function trocaAcha"), html.indexOf("function trocaBox"));
  assert.ok(corpo.includes("await trocaPais(") && corpo.includes("Troca.escolheCategoria(d, pais)") && corpo.includes("Troca.categoriaPai(d, cat, pais)"));
  assert.ok(!corpo.includes("categoriaDe"), "trocaAcha voltou a usar o último tag (categoriaDe)");
  const tp = html.slice(html.indexOf("async function trocaPais"), html.indexOf("async function trocaAcha"));
  assert.ok(tp.includes("await offJson(url)") && !/catch \(e\) \{\s*return/.test(tp), "falha da taxonomia tem que propagar, não virar {}");
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
