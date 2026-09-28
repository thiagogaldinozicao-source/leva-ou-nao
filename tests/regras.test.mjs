// Motor de regras (www/regras.js) contra produtos reais no formato do Open Food Facts.
// Esperado = o veredito que o motor dá hoje. Mudou uma regra de propósito? Atualize aqui junto.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const raiz = new URL("../", import.meta.url);
// regras.js é script clássico (igual no navegador): roda no contexto global e deixa globalThis.Regras.
vm.runInThisContext(readFileSync(new URL("www/regras.js", raiz), "utf8"), { filename: "www/regras.js" });
vm.runInThisContext(readFileSync(new URL("www/rotulo.js", raiz), "utf8"), { filename: "www/rotulo.js" });   // a lupa lida do rótulo entra por d._rotulo.altoEm
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
  assert.ok(tem(r.pontos_ruins, /^Alto em gordura saturada: 9 g em 100 g/));   // lupa da Anvisa (≥ 6 g/100 g), no lugar do limite próprio de antes
  assert.deepEqual(r.lupa, ["gordura"]);
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

// ---------- perfis alimentares (🌾 glúten · 🥛 lactose · 🍬 açúcar) ----------
const FIXTURES = ["agua", "biscoito-recheado", "iogurte-acucar", "iogurte-natural", "nescau", "papinha", "refrigerante-zero", "suco-caixa", "toddy"];
const GL = { gluten: true }, LAC = { lactose: true }, ACU = { acucar: true };
// produto mínimo: NOVA 1 e sem nutriente, pra o veredito de base ser "comprar" quando a lista é curta e limpa
const prodT = extra => ({ product_name_pt: "Teste", nova_group: 1, nutriments: {}, ...extra });
const perfil = (r, id) => r.perfis.find(p => p.id === id);

test("sem perfil ligado: resultado idêntico ao de antes, sem a chave perfis", () => {
  const desligados = [undefined, null, {}, { gluten: false, lactose: false, acucar: false }];
  for (const nome of FIXTURES) for (const bebe of [false, true]) {
    const antes = analisarProduto(fx(nome), bebe);
    assert.equal("perfis" in antes, false, nome);
    for (const p of desligados) assert.deepEqual(analisarProduto(fx(nome), bebe, p), antes, nome);
  }
  const rotulo = "Ingredientes: farinha de trigo, leite, açúcar. CONTÉM GLÚTEN.";
  for (const p of desligados) assert.deepEqual(avaliar(rotulo, false, false, p), avaliar(rotulo, false));
  for (const x of FIXTURES) for (const y of FIXTURES) {
    const a = analisarProduto(fx(x), false), b = analisarProduto(fx(y), false), antes = comparar(a, b, false);
    assert.equal("perfis" in antes, false);
    for (const p of desligados) assert.deepEqual(comparar(a, b, false, p), antes, x + " × " + y);
  }
});

test("glúten: 'não contém glúten' e selo → ok; 'contém glúten' não casa com 'não contém'", () => {
  const r = analisarProduto(prodT({ ingredients_text_pt: "Arroz, sal. NÃO CONTÉM GLÚTEN." }), false, GL);
  assert.deepEqual(r.perfis, [{ id: "gluten", estado: "ok", motivo: "O rótulo diz: não contém glúten" }]);
  assert.equal(r.veredito, "comprar");
  assert.equal(perfil(analisarProduto(prodT({ ingredients_text_pt: "Arroz", labels_tags: ["en:gluten-free"] }), false, GL), "gluten").estado, "ok");
  assert.equal(perfil(analisarProduto(prodT({ ingredients_text_pt: "Trigo sarraceno. Sem glúten." }), false, GL), "gluten").estado, "ok");
});

test("glúten: 'contém glúten', trigo/aveia na lista ou alérgeno → não; veredito vira deixar na prateleira", () => {
  const r = analisarProduto(prodT({ ingredients_text_pt: "Farinha de trigo, água, sal, fermento. CONTÉM GLÚTEN." }), false, GL);
  assert.deepEqual(perfil(r, "gluten"), { id: "gluten", estado: "nao", motivo: "O rótulo diz: contém glúten" });
  assert.equal(r.veredito, "evitar");
  assert.equal(r.resumo, "Não serve pro seu perfil.");
  assert.equal(perfil(analisarProduto(prodT({ ingredients_text_pt: "Aveia em flocos" }), false, GL), "gluten").motivo, "Tem aveia nos ingredientes");
  assert.equal(perfil(analisarProduto(prodT({ ingredients_text_pt: "Arroz", allergens_tags: ["en:gluten"] }), false, GL), "gluten").estado, "nao");
  assert.equal(perfil(analisarProduto(prodT({ ingredients_text_pt: "Arroz", _rotulo: { contem: { gluten: true } } }), false, GL), "gluten").estado, "nao");
  // trigo na lista vence o "não contém glúten" (na dúvida, protege o celíaco)
  assert.equal(perfil(analisarProduto(prodT({ ingredients_text_pt: "Farinha de trigo. Não contém glúten." }), false, GL), "gluten").estado, "nao");
});

test("glúten: traços e falta de dado → atenção (nunca ok por ausência), no máximo moderação", () => {
  const r = analisarProduto(prodT({ ingredients_text_pt: "Arroz, milho, sal. Alérgicos: pode conter trigo e cevada." }), false, GL);
  assert.deepEqual(perfil(r, "gluten"), { id: "gluten", estado: "atencao", motivo: "Pode ter traços de glúten" });
  assert.equal(r.veredito, "moderacao");
  assert.equal(r.resumo, "Pelo rótulo tá bom, mas confira pro seu perfil.");
  assert.equal(perfil(analisarProduto(prodT({ ingredients_text_pt: "Arroz", traces_tags: ["en:gluten"] }), false, GL), "gluten").estado, "atencao");
  const sem = perfil(analisarProduto(prodT({}), false, GL), "gluten");
  assert.deepEqual(sem, { id: "gluten", estado: "atencao", motivo: "Não deu pra confirmar" });
  const semFrase = analisarProduto(prodT({ ingredients_text_pt: "Arroz, feijão" }), false, GL);
  assert.equal(perfil(semFrase, "gluten").estado, "atencao");
  assert.equal(semFrase.veredito, "moderacao");
  // já era "evitar": atenção não mexe no veredito nem no resumo
  const nescau = analisarProduto(fx("nescau"), false, GL);
  assert.equal(nescau.veredito, "evitar");
  assert.equal(nescau.resumo, analisarProduto(fx("nescau"), false).resumo);
});

test("lactose: leite na lista, alérgeno e 'contém lactose' → não", () => {
  const r = analisarProduto(fx("iogurte-natural"), false, LAC);
  assert.deepEqual(r.perfis, [{ id: "lactose", estado: "nao", motivo: "Tem leite nos ingredientes" }]);
  assert.equal(r.veredito, "evitar");
  assert.equal(perfil(analisarProduto(prodT({ ingredients_text_pt: "Cacau, soro de leite em pó" }), false, LAC), "lactose").motivo, "Tem soro de leite nos ingredientes");
  assert.equal(perfil(analisarProduto(prodT({ ingredients_text_pt: "Arroz", allergens_tags: ["en:milk"] }), false, LAC), "lactose").estado, "nao");
  assert.equal(perfil(analisarProduto(prodT({ ingredients_text_pt: "Proteína, cacau. CONTÉM LACTOSE." }), false, LAC), "lactose").motivo, "O rótulo diz: contém lactose");
});

test("lactose: zero lactose, leite de coco, manteiga de cacau e traço de leite → ok; sem dado → atenção", () => {
  const zero = analisarProduto(prodT({ ingredients_text_pt: "Leite integral, enzima lactase. ZERO LACTOSE", allergens_tags: ["en:milk"] }), false, LAC);
  assert.deepEqual(perfil(zero, "lactose"), { id: "lactose", estado: "ok", motivo: "O rótulo diz: sem lactose" });
  assert.equal(perfil(analisarProduto(prodT({ ingredients_text_pt: "Leite", labels_tags: ["en:lactose-free"] }), false, LAC), "lactose").estado, "ok");
  const coco = perfil(analisarProduto(prodT({ ingredients_text_pt: "Leite de coco, água, goma guar" }), false, LAC), "lactose");
  assert.deepEqual(coco, { id: "lactose", estado: "ok", motivo: "Sem leite nos ingredientes" });
  assert.equal(perfil(analisarProduto(prodT({ ingredients_text_pt: "Massa de cacau, manteiga de cacau, açúcar" }), false, LAC), "lactose").estado, "ok");
  assert.equal(perfil(analisarProduto(prodT({ ingredients_text_pt: "Amendoim, sal. Alérgicos: pode conter leite." }), false, LAC), "lactose").estado, "ok");
  assert.deepEqual(perfil(analisarProduto(prodT({}), false, LAC), "lactose"), { id: "lactose", estado: "atencao", motivo: "Não deu pra confirmar" });
});

test("pouco açúcar: adicionado ou muito açúcar natural → não; adoçante não penaliza; sem dado → atenção", () => {
  assert.deepEqual(perfil(analisarProduto(fx("nescau"), false, ACU), "acucar"), { id: "acucar", estado: "nao", motivo: "Tem açúcar adicionado" });
  const tamara = analisarProduto(prodT({ ingredients_text_pt: "Tâmaras desidratadas", nutriments: { sugars_100g: 63 } }), false, ACU);
  assert.deepEqual(perfil(tamara, "acucar"), { id: "acucar", estado: "nao", motivo: "Muito açúcar, mesmo sendo natural (63 g em 100 g)" });
  assert.equal(tamara.veredito, "evitar");
  const zero = analisarProduto(fx("refrigerante-zero"), false, ACU);
  assert.deepEqual(perfil(zero, "acucar"), { id: "acucar", estado: "ok", motivo: "Sem açúcar adicionado (0 g em 100 g)" });
  assert.equal(perfil(analisarProduto(fx("papinha"), false, ACU), "acucar").estado, "ok"); // 11 g/100 g de fruta < 15
  assert.equal(perfil(analisarProduto(prodT({ ingredients_text_pt: "Castanha de caju" }), false, ACU), "acucar").motivo, "Sem açúcar adicionado, mas não sei o total");
  assert.deepEqual(perfil(analisarProduto(prodT({ nutriments: { sugars_100g: 3 } }), false, ACU), "acucar"), { id: "acucar", estado: "atencao", motivo: "Não deu pra confirmar" });
});

test("vários perfis: um por ligado, na ordem glúten → lactose → açúcar; bebê segue o veredito final", () => {
  const r = analisarProduto(fx("agua"), true, { gluten: true, lactose: true, acucar: true });
  assert.deepEqual(r.perfis.map(p => [p.id, p.estado]), [["gluten", "atencao"], ["lactose", "ok"], ["acucar", "ok"]]);
  assert.equal(r.veredito, "moderacao");
  assert.equal(r.bebe.serve, false); // bebê segue o veredito FINAL (perfil já rebaixou pra moderação): nada de "serve" ao lado de ressalva
  const ocr = avaliar("Ingredientes: farinha de trigo, leite, açúcar. CONTÉM GLÚTEN.", false, false, { gluten: true, lactose: true });
  assert.deepEqual(ocr.perfis.map(p => p.estado), ["nao", "nao"]);
  assert.equal(ocr.veredito, "evitar");
});

test("comparar 2 com perfil: quem falha perde; os dois falham → nenhum serve", () => {
  const trigo = prodT({ ingredients_text_pt: "Farinha de trigo, água, sal, fermento" });
  const arroz = prodT({ ingredients_text_pt: "Arroz, açúcar, sal. Não contém glúten.", nova_group: 3 });
  assert.equal(comparar(analisarProduto(trigo, false), analisarProduto(arroz, false), false).melhor, "a"); // sem perfil, o trigo ganha
  const c = comparar(analisarProduto(trigo, false, GL), analisarProduto(arroz, false, GL), false, GL);
  assert.equal(c.melhor, "b");
  assert.equal(c.motivo, "O outro não serve pro seu perfil.");
  assert.equal(c.diferencas[0], "O outro: tem trigo nos ingredientes");
  assert.ok(c.diferencas.length <= 3);
  assert.deepEqual(c.perfis, { estado: "ok", motivo: "O escolhido serve pro seu perfil." });
  const dois = comparar(analisarProduto(trigo, false, GL), analisarProduto(fx("biscoito-recheado"), false, GL), false, GL);
  assert.equal(dois.melhor, "a");
  assert.deepEqual(dois.perfis, { estado: "nao", motivo: "Nenhum dos dois serve pro seu perfil." });
});

test("pouco açúcar: 'não contém açúcar', 'sem adição de açúcares' e 'Açúcares totais 0 g' do OCR não viram açúcar adicionado", () => {
  const ac = (txt, limpo = false) => perfil(avaliar(txt, false, limpo, ACU), "acucar");
  for (const txt of ["Ingredientes: farinha de arroz, sal. Não contém açúcar.",
    "Ingredientes: arroz integral, sal marinho. Valor energético 350 kcal. Açúcares totais 0 g",
    "Ingredientes: água, suco de limão. Sem adição de açúcares.", "Ingredientes: aveia, cacau. ZERO AÇÚCAR ADICIONADO"])
    assert.notEqual(ac(txt).estado, "nao", txt);
  for (const txt of ["Water, lemon. No added sugar.", "Water, lemon. Sugar free", "Water. Without sugar"]) assert.notEqual(ac(txt, true).estado, "nao", txt);
  const p = ing => perfil(analisarProduto(prodT({ ingredients_text_pt: ing }), false, ACU), "acucar");
  assert.notEqual(p("Arroz, sal. Não contém açúcar").estado, "nao");
  assert.notEqual(p("Castanha de caju. Sem adição de açúcares").estado, "nao");
  // a negação só apaga a própria frase: açúcar de verdade na lista continua reprovando
  assert.equal(ac("Ingredientes: farinha, açúcar, sal.").estado, "nao");
  assert.equal(ac("Ingredientes: aveia, mel. Açúcares totais 12 g").estado, "nao");
  assert.equal(ac("Water, sugar. No added sugar", true).estado, "nao");
  assert.equal(p("Cereal, xarope de glicose. Sem adição de açúcar").estado, "nao");
  assert.equal(p("Arroz, mel").motivo, "Tem açúcar adicionado");
  // OFF = lista inteira: nada antes de "ingrediente" nem depois de 700 chars pode sumir
  assert.equal(p("Açúcar, cacau, lecitina de soja*. *Ingrediente transgênico").estado, "nao");
  assert.equal(p("Ingredientes: farinha, " + "fibra de trigo, ".repeat(60) + "açúcar").estado, "nao");
});

test("lactose: '10% lactose' não vira 'sem lactose'; '0%' e '0,0%' continuam valendo", () => {
  const lc = ing => perfil(analisarProduto(prodT({ ingredients_text_pt: ing }), false, LAC), "lactose");
  assert.equal(lc("Leite, cacau. Com 10% de lactose").estado, "nao");
  assert.equal(lc("Leite em pó, maltodextrina. Contém 20% lactose").estado, "nao");
  assert.equal(lc("Leite em pó. 1,0% lactose").estado, "nao");
  assert.equal(lc("Leite integral, lactase. 0% lactose").estado, "ok");
  assert.equal(lc("Leite integral, lactase. 0,0% de lactose").estado, "ok");
});

test("inglês: milk/cheese/butter/cream/yogurt = lactose; sugar/syrup/honey/glucose/fructose/dextrose/maltodextrin = açúcar adicionado", () => {
  const en = (ing, perfis) => analisarProduto(prodT({ ingredients_text: ing }), false, perfis);
  for (const ing of ["Goat milk, salt", "Whole goat milk powder", "Water, skim milk, salt", "Wheat flour, butter, salt", "Cheddar cheese, water", "Sweet cream, salt", "Yoghurt, fruit", "Buttermilk", "Whey protein", "Milk chocolate, lactose"])
    assert.equal(perfil(en(ing, LAC), "lactose").estado, "nao", ing);
  assert.equal(perfil(en("Whole milk powder", LAC), "lactose").motivo, "Tem leite nos ingredientes");   // nome em português na tela
  // leites vegetais, manteiga de cacau/amendoim e creme de tártaro não são lactose (igual às exceções em português)
  for (const ing of ["Coconut milk, water", "Almond milk, salt", "Soy milk", "Oat milk, calcium", "Cocoa butter, cocoa mass", "Peanut butter", "Shea butter", "Cream of tartar, flour", "Coconut cream"])
    assert.equal(perfil(en(ing, LAC), "lactose").estado, "ok", ing);
  for (const ing of ["Water, sugar", "Corn syrup", "Honey, oats", "Glucose-fructose syrup", "Dextrose, salt", "Maltodextrin, salt", "Cane sugar"])
    assert.equal(perfil(en(ing, ACU), "acucar").estado, "nao", ing);
  for (const ing of ["Water, sea salt", "Peanuts, salt", "Sugarcane"]) assert.notEqual(perfil(en(ing, ACU), "acucar").estado, "nao", ing);
});

test("bebê depois dos perfis: 'serve' só se o veredito final é comprar", () => {
  const trigo = prodT({ ingredients_text_pt: "Arroz, farinha de trigo. Contém glúten." });
  const sem = analisarProduto(trigo, true), com = analisarProduto(trigo, true, GL);
  assert.equal(sem.veredito, "comprar");
  assert.equal(sem.bebe.serve, true);                       // sem perfil, igual a antes
  assert.equal(com.veredito, "evitar");
  assert.deepEqual(com.bebe, { serve: false, motivo: "Não serve pro seu perfil alimentar." });   // não sai "serve" ao lado de "Deixa na prateleira"
  const atencao = analisarProduto(prodT({ ingredients_text_pt: "Arroz" }), true, GL);
  assert.equal(atencao.veredito, "moderacao");
  assert.deepEqual(atencao.bebe, { serve: false, motivo: "Confira o rótulo pro seu perfil alimentar." });
  const ok = analisarProduto(prodT({ ingredients_text_pt: "Arroz. Sem glúten." }), true, GL);
  assert.equal(ok.veredito, "comprar");
  assert.equal(ok.bebe.serve, true);
  // OCR (avaliar): mesma regra
  const ocr = avaliar("Ingredientes: farinha de trigo, água. Contém glúten.", true, false, GL);
  assert.equal(ocr.veredito, "evitar");
  assert.equal(ocr.bebe.serve, false);
  // já reprovado pelo motor (sem perfil mexer): motivo de antes
  assert.equal(analisarProduto(fx("nescau"), true, GL).bebe.motivo, "Tem coisa que é melhor evitar pra idade dele.");
  // sem bebê, sem chave
  assert.equal("bebe" in analisarProduto(trigo, false, GL), false);
});

// ---- lupa "ALTO EM" (RDC 429/2020 + IN 75/2020, Anexo XV): açúcar adicionado 15 g|7,5 g, gordura saturada 6 g|3 g, sódio 600 mg|300 mg (por 100 g | 100 ml)
const lp = extra => analisarProduto(prodT({ nova_group: 2, ingredients_text_pt: "Arroz, sal", ...extra }), false);   // NOVA 2: sem ponto de NOVA e sem a vedação do NOVA 1
const nut = (o, quantity) => lp({ quantity, nutriments: o });

test("lupa, sólido: limite exato conta (≥), logo abaixo não; um por nutriente", () => {
  assert.deepEqual(nut({ "added-sugars_100g": 15 }, "200 g").lupa, ["acucar"]);
  assert.deepEqual(nut({ "added-sugars_100g": 14.9 }, "200 g").lupa, []);
  assert.deepEqual(nut({ "saturated-fat_100g": 6 }, "200 g").lupa, ["gordura"]);
  assert.deepEqual(nut({ "saturated-fat_100g": 5.9 }, "200 g").lupa, []);
  assert.deepEqual(nut({ sodium_100g: 0.6 }, "200 g").lupa, ["sodio"]);      // OFF traz sódio em g: 0,6 g = 600 mg
  assert.deepEqual(nut({ sodium_100g: 0.599 }, "200 g").lupa, []);
  assert.deepEqual(nut({ salt_100g: 1.5 }, "200 g").lupa, ["sodio"]);        // sem sódio, sal ÷ 2,5: 1,5 g de sal = 600 mg de sódio
  assert.deepEqual(nut({ salt_100g: 1.4 }, "200 g").lupa, []);
  assert.deepEqual(nut({ "added-sugars_100g": 20, "saturated-fat_100g": 8, sodium_100g: 0.9 }, "1 kg").lupa, ["acucar", "gordura", "sodio"]);   // ordem fixa da Anvisa
  const r = nut({ "saturated-fat_100g": 9, sodium_100g: 0.72 }, "200 g");
  assert.deepEqual(r.pontos_ruins, ["Alto em gordura saturada: 9 g em 100 g", "Alto em sódio: 720 mg em 100 g"]);
});

test("lupa, líquido (ml/l na quantity): limites pela metade, e o mesmo número em g não acusa", () => {
  assert.deepEqual(nut({ "added-sugars_100g": 7.5 }, "350 ml").lupa, ["acucar"]);
  assert.deepEqual(nut({ "added-sugars_100g": 7.4 }, "350 ml").lupa, []);
  assert.deepEqual(nut({ "added-sugars_100g": 7.5 }, "350 g").lupa, []);
  assert.deepEqual(nut({ "saturated-fat_100g": 3 }, "1 L").lupa, ["gordura"]);
  assert.deepEqual(nut({ "saturated-fat_100g": 3 }, "1,5 litros").lupa, ["gordura"]);
  assert.deepEqual(nut({ sodium_100g: 0.3 }, "2 x 200ml").lupa, ["sodio"]);
  assert.deepEqual(nut({ sodium_100g: 0.29 }, "2 x 200ml").lupa, []);
  assert.equal(nut({ "saturated-fat_100g": 4 }, "1 L").pontos_ruins[0], "Alto em gordura saturada: 4 g em 100 ml");
  assert.deepEqual(nut({ sodium_100g: 0.4 }, "1 lata").lupa, []);                 // "lata" não é litro: sem unidade = sólido
});

test("lupa, líquido sem unidade: categoria de bebida decide (sem pó), sem nada = sólido", () => {
  const sod = extra => lp({ nutriments: { sodium_100g: 0.4 }, ...extra }).lupa;
  assert.deepEqual(sod({ categories_tags: ["en:beverages", "en:sodas"] }), ["sodio"]);
  assert.deepEqual(sod({ categories_tags: ["en:beverages", "en:instant-beverages"] }), []);
  assert.deepEqual(sod({ categories_tags: ["en:beverages"], quantity: "400 g" }), []);   // unidade escrita manda
  assert.deepEqual(sod({}), []);
});

test("lupa, sem dado = sem lupa: açúcar total alto sem added-sugars não vira lupa de açúcar", () => {
  assert.deepEqual(lp({}).lupa, []);
  assert.deepEqual(lp({ nutriments: {} }).lupa, []);
  assert.deepEqual(lp({ nutriments: { "added-sugars_100g": "", "saturated-fat_100g": null, sodium_100g: "abc" } }).lupa, []);
  const r = lp({ ingredients_text_pt: "Açúcar, cacau", nutriments: { sugars_100g: 60 } }, "200 g");
  assert.deepEqual(r.lupa, []);
  assert.ok(tem(r.pontos_ruins, /^Muito açúcar: 60 g/));      // a linha antiga do açúcar total segue valendo, sem se passar por lupa
  assert.equal("lupa" in analisarProduto(prodT({}), false), true);
  assert.deepEqual(analisarProduto(prodT({}), false).lupa, []);
});

test("lupa entra no veredito: 1 ponto por nutriente, sem contar 2x o que já contava", () => {
  assert.equal(nut({ "saturated-fat_100g": 5.9 }, "200 g").veredito, "comprar");
  const g = nut({ "saturated-fat_100g": 6 }, "200 g");
  assert.equal(g.veredito, "moderacao"); assert.equal(g._pts, 1);
  const s = lp({ nutriments: { salt_100g: 2 } });                 // sal 2 g = 800 mg de sódio: antes "Muito sal" (+1), agora a lupa no lugar (+1, não +2)
  assert.deepEqual(s.lupa, ["sodio"]); assert.equal(s._pts, 1);
  assert.equal(s.pontos_ruins.some(x => /^Muito sal/.test(x)), false);
  const liq = lp({ quantity: "1 L", nutriments: { salt_100g: 1 } });   // 1 g de sal = 400 mg de sódio: só a lupa de líquido pega
  assert.deepEqual(liq.lupa, ["sodio"]); assert.equal(liq._pts, 1);
  const tri = nut({ "added-sugars_100g": 20, "saturated-fat_100g": 8, sodium_100g: 0.9 }, "200 g");
  assert.equal(tri.veredito, "evitar");
});

test("lupa: fixtures do repo — só o biscoito recheado ganha lupa, e nenhum veredito mudou", () => {
  const esperado = { agua: "comprar", "biscoito-recheado": "evitar", "iogurte-acucar": "evitar", "iogurte-natural": "comprar", nescau: "evitar", papinha: "comprar", "refrigerante-zero": "evitar", "suco-caixa": "evitar", toddy: "evitar" };
  for (const nome of FIXTURES) {
    const r = analisarProduto(fx(nome), false);
    assert.equal(r.veredito, esperado[nome], nome);
    assert.deepEqual(r.lupa, nome === "biscoito-recheado" ? ["gordura"] : [], nome);
  }
});

test("lupa vedada (IN 75, Anexo XVI): in natura, queijo, azeite, sal não levam lupa; com açúcar adicionado na lista, levam", () => {
  const ve = extra => analisarProduto(prodT({ nutriments: { "saturated-fat_100g": 20, sodium_100g: 0.9 }, ...extra }), false).lupa;
  assert.deepEqual(ve({ nova_group: 1, ingredients_text_pt: "Castanha-do-pará" }), []);
  assert.deepEqual(ve({ nova_group: 3, ingredients_text_pt: "Leite, sal, coalho", categories_tags: ["en:dairies", "en:cheeses"] }), []);
  assert.deepEqual(ve({ nova_group: 2, ingredients_text_pt: "Azeite de oliva", categories_tags: ["en:olive-oils"] }), []);
  assert.deepEqual(ve({ nova_group: 2, ingredients_text_pt: "Sal", categories_tags: ["en:salts"] }), []);
  assert.deepEqual(ve({ nova_group: 4, ingredients_text_pt: "Leite, açúcar, polpa de morango", categories_tags: ["en:yogurts"], nutriments: { "added-sugars_100g": 16, "saturated-fat_100g": 3 } }), ["acucar"]);
  assert.deepEqual(ve({ nova_group: 4, ingredients_text_pt: "Manteiga, sal", categories_tags: ["en:butters"] }), ["gordura", "sodio"]);   // manteiga não está no Anexo XVI
  // a vedação só cala número do OFF; a lupa que o rótulo mostra (nutriente ausente no OFF) é fato da embalagem e vale
  assert.deepEqual(ve({ nova_group: 3, ingredients_text_pt: "Leite, sal", categories_tags: ["en:cheeses"], _rotulo: { altoEm: ["sodio"] } }), []);
  assert.deepEqual(ve({ nova_group: 3, ingredients_text_pt: "Leite, sal", categories_tags: ["en:cheeses"], nutriments: {}, _rotulo: { altoEm: ["sodio"] } }), ["sodio"]);
});

test("lupa lida do rótulo: vale quando o OFF não tem o nutriente; número do OFF manda quando existe", () => {
  const ler = txt => Rotulo.ler(txt);
  const lido = ler("ALTO EM AÇÚCAR ADICIONADO E SÓDIO\nIngredientes: farinha de trigo, açúcar, sal.");
  assert.deepEqual(lido.altoEm, ["acucar_adicionado", "sodio"]);
  const d = extra => analisarProduto(prodT({ nova_group: 4, ingredients_text_pt: lido.ingredientes || "Farinha de trigo, açúcar, sal", _rotulo: lido, ...extra }), false);
  const r = d({});
  assert.deepEqual(r.lupa, ["acucar", "sodio"]);
  assert.deepEqual(r.pontos_ruins.slice(0, 2), ["Alto em açúcar adicionado (lido no rótulo)", "Alto em sódio (lido no rótulo)"]);
  assert.deepEqual(d({ nutriments: { sodium_100g: 0.1 } }).lupa, ["acucar"]);            // OFF tem sódio e ele é baixo: o número manda; açúcar adicionado o OFF não tem, vale o rótulo
  assert.deepEqual(analisarProduto(prodT({ ingredients_text_pt: "Arroz, sal", _rotulo: ler("Ingredientes: arroz, sal.") }), false).lupa, []);   // rótulo sem lupa
});

test("pontuação do açúcar: 'não contém açúcar' / 'sem adição de açúcares' não conta como açúcar adicionado (mesma régua do perfil)", () => {
  // OCR (avaliar): antes "Tem açúcar adicionado" e "açúcar entre os primeiros" por casar a palavra crua
  for (const neg of ["Não contém açúcar.", "Sem adição de açúcares.", "Zero açúcar adicionado.", "Açúcares totais 0 g"]) {
    const r = avaliar("Ingredientes: farinha de arroz, sal. " + neg, false);
    assert.equal(r._pts, 0, neg);
    assert.equal(r.veredito, "comprar", neg);
    assert.ok(r.pontos_bons.includes("Sem açúcar adicionado"), neg);
  }
  // açúcar de verdade continua contando, mesmo com negação em outra frase
  assert.equal(avaliar("Ingredientes: açúcar, farinha, sal.", false)._pts >= 2, true);
  assert.equal(avaliar("Ingredientes: farinha, sal, amido, óleo, mel. Sem adição de açúcar refinado.", false).pontos_ruins.includes("Tem açúcar adicionado"), true);
  // OFF (analisarProduto): "Muito açúcar" só com açúcar adicionado na lista
  const acu = ing => analisarProduto(prodT({ nova_group: 2, ingredients_text_pt: ing, nutriments: { sugars_100g: 30 } }), false);
  assert.equal(tem(acu("Arroz, sal. Não contém açúcar").pontos_ruins, /^Muito açúcar/), false);
  assert.equal(tem(acu("Castanha de caju. Sem adição de açúcares").pontos_ruins, /^Muito açúcar/), false);
  assert.equal(acu("Arroz, sal. Não contém açúcar")._pts, 0);
  assert.equal(tem(acu("Arroz, xarope de glicose").pontos_ruins, /^Muito açúcar: 30 g/), true);
  assert.equal(tem(acu("Arroz, mel").pontos_ruins, /^Muito açúcar: 30 g/), true);
});
