/* Leva ou não? — motor de regras: funções puras, sem DOM, sem rede.
   Script clássico (sem import/export): carrega antes do script da página, então tudo aqui
   fica global pro index.html. `globalThis.Regras` no fim é a porta pro teste em Node
   (tests/regras.test.mjs). Mudou regra? Atualize o esperado do teste junto. */
const nrm = s => String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
const nomeProd = d => { const n = d.product_name_pt || d.product_name || d.generic_name_pt || "Produto", m = d.brands && d.brands.split(",")[0].trim(); return m && !nrm(n).includes(nrm(m)) ? n + " · " + m : n; };
function ingredientesDe(raw, limpo){
  const t = nrm(raw).replace(/\s+/g, " ");
  const i = t.search(/ingredientes?\s*[:.;]?/);
  if (i < 0) {
    const hits = (t.match(/(acucar|xarope|sucralose|esulfame|aspartame|conservador|corante|aromatizante|aroma|espessante|estabilizante|acidulante|farinha|soro de leite|gordura)/g) || []).length;
    if (limpo && t.length > 3) { const seg = t.split(/(alergicos|contem gluten|nao contem gluten|informacao nutricional|porcao)/)[0]; return { achou: true, texto: seg.trim(), lista: seg.split(/[,;]|\se\s(?=[^,]*$)/).map(x => x.trim()).filter(x => x.length > 1) }; }
    if (hits >= 3) return { achou: true, semOrdem: true, texto: t.slice(0, 1500), lista: [] };
  }
  let seg = i >= 0 ? t.slice(i).replace(/^ingredientes?\s*[:.;]?\s*/, "") : t;
  seg = seg.replace(/(fabricado e distribuido por|fabricado por|distribuido por|fabricado|embalado por)/g, " ");
  const stop = seg.search(/(alergicos|alergenicos|contiene|contem gluten|nao contem gluten|no contiene|contem lactose|informacao nutricional|conservar|conservacao|validade|produzido por|porcao)/);
  if (stop > 20) seg = seg.slice(0, stop);
  seg = seg.slice(0, 700);
  return { achou: i >= 0, texto: seg.trim(), lista: seg.split(/[,;]/).map(x => x.trim()).filter(x => x.length > 1) };
}
const TIPOS = [
  [/bebida lactea/, "Bebida láctea"], [/achocolatado/, "Achocolatado"], [/refrigerante/, "Refrigerante"],
  [/agua de coco/, "Água de coco"], [/nectar|refresco/, "Refresco/néctar"], [/suco/, "Suco"], [/ricota/, "Ricota"],
  [/iogurte/, "Iogurte"], [/requeijao/, "Requeijão"], [/queijo/, "Queijo"], [/biscoito|bolacha/, "Biscoito"],
  [/barra|castanha|tamara/, "Barrinha"], [/azeite/, "Azeite"], [/cereal|aveia/, "Cereal"], [/salsicha|presunto|mortadela|linguica/, "Embutido"],
  [/cafe/, "Café"], [/leite/, "Leite/derivado"], [/pao/, "Pão"], [/macarrao|massa/, "Massa"], [/molho/, "Molho"]
];

/* Perfis alimentares (🌾 sem glúten · 🥛 sem lactose · 🍬 pouco açúcar): só alimento, só os ligados.
   Nenhum ligado = resultado idêntico ao de antes (nem a chave `perfis` aparece).
   Glúten NUNCA dá "ok" por falta de dado (falso "sem glúten" machuca celíaco): "ok" só com selo ou
   "não contém glúten" escrito (Lei 10.674/2003); na dúvida, "atencao".
   Lactose (RDC 136/2017 "CONTÉM LACTOSE"): traço de leite não conta, intolerância é por dose.
   Pouco açúcar: adoçante não penaliza; o motor não sabe o que é líquido, então vale a régua do sólido. */
const PERFIS = ["gluten", "lactose", "acucar"];
const NEG = "(?:nao cont[e3]m|sem|zero|isent[oa] de|livre de|sin) ?(?:de )?";
const TRACOS = /(?<![a-z])(?:podem? conter|tracos? de)(?:(?!(?<![a-z])(?:nao )?cont[e3]m(?![a-z])|alergic)[^.;]){0,160}/g;
const GL_NEG = new RegExp("(?<![a-z])" + NEG + "glute[nm](?![a-z])|glute[nm][ -]free", "g");
const GL_SIM = /(?<![a-z])cont[e3]m ?glute[nm](?![a-z])/;
const GL_GRAO = /(?<![a-z])(trigo(?![ -]sarraceno)|centeio|cevada|malte|aveia|espelta|semolina(?! de (?:milho|arroz))|glute[nm]|centeno|cebada|avena|wheat|barley|rye|oats?|malt|spelt)(?![a-z])/;
const LC_NEG = new RegExp("(?<![a-z])(?:" + NEG + "|(?<![\\d.,])0(?:[.,]0+)? ?% ?(?:de )?)lactose(?![a-z])|lactose[ -]free", "g");
const LC_SIM = /(?<![a-z])cont[e3]m ?lactose(?![a-z])/;
const LEITE_NEG = /(?<![a-z])(?:nao cont[e3]m|sem|isent[oa] de|livre de) (?:leite|derivados de leite|lacteos)(?![a-z])/g;
const LACTEO = /(?<![a-z])(soro de leite|creme de leite|leites?(?![ -]de[ -](?:coco|amendoas?|soja|aveia|arroz|castanhas?|caju|amendoim))(?! vegeta)|lactose|manteiga(?! de (?:cacau|amendoim|karite|castanhas?))|queijos?|requeijao|iogurtes?|leitelho|whey|composto lacteo|solidos (?:lacteos|de leite)|nata|(?<!\b(?:coconut|almond|soy|soya|oat|rice|cashew|hazelnut|peanut|pea|hemp|nut|plant) )milks?|buttermilk|cheeses?|(?<!\b(?:cocoa|cacao|peanut|shea|almond|nut|cashew|coconut) )butter|(?<!\bcoconut )cream(?! of (?:tartar|coconut))|yogh?urts?)(?![a-z])/;
const ACU_ADD = /(a[cg]ucar|azucar|xarope|jarabe|sacarose|glicose|glucosa|frutose|fructosa|maltodextrina|dextrose|melado|melaco|rapadura|(?<![a-z])mel(?![a-z])|(?<![a-z])(?:sugars?|syrups?|honey|glucose|fructose|maltodextrin|sucrose|molasses)(?![a-z]))/;
// Negação e tabela não são açúcar adicionado: "não contém açúcar", "sem adição de açúcares", "no added sugar", "sugar free", "açúcares totais 0 g".
const ACU_NEG = new RegExp("(?<![a-z])(?:" + NEG + "(?:adicao de )?a[cgz]ucar(?:es)?(?: adicionados?)?|(?:no|without|zero|free of) (?:added )?sugars?|sugars?[ -]free)(?![a-z])|a[cg]ucares totais", "g");
const acucarAdicionado = txt => ACU_ADD.test(nrm(txt).replace(ACU_NEG, " "));
const NOME_ING = { gluten: "glúten", glutem: "glúten", centeno: "centeio", cebada: "cevada", avena: "aveia", wheat: "trigo", barley: "cevada", rye: "centeio", oat: "aveia", oats: "aveia",
  malt: "malte", spelt: "espelta", milk: "leite", milks: "leite", cheese: "queijo", cheeses: "queijo", butter: "manteiga", cream: "creme", buttermilk: "leitelho",
  yogurt: "iogurte", yoghurt: "iogurte", yogurts: "iogurte", yoghurts: "iogurte", leites: "leite", queijos: "queijo", iogurtes: "iogurte", requeijao: "requeijão", "composto lacteo": "composto lácteo", "solidos lacteos": "sólidos lácteos", "solidos de leite": "sólidos de leite" };
const estadoPerfil = (estado, motivo) => ({ estado, motivo });
function perfilGluten(c){
  const lim = c.sem.replace(GL_NEG, " ");
  if (c.dito.gluten === true || GL_SIM.test(lim)) return estadoPerfil("nao", "O rótulo diz: contém glúten");
  if (c.al.includes("en:gluten") || c.alerg.some(a => /^(trigo|centeio|cevada|aveia)$/.test(a))) return estadoPerfil("nao", "Glúten está nos alérgenos");
  const g = lim.match(GL_GRAO);
  if (g) return estadoPerfil("nao", "Tem " + (NOME_ING[g[1]] || g[1]) + " nos ingredientes");
  if (c.tr.includes("en:gluten") || GL_GRAO.test(c.tracos)) return estadoPerfil("atencao", "Pode ter traços de glúten");
  if (c.lb.some(x => /^en:(no-gluten|gluten-free)$/.test(x))) return estadoPerfil("ok", "Selo de sem glúten");
  if (c.dito.gluten === false || c.t.search(GL_NEG) >= 0) return estadoPerfil("ok", "O rótulo diz: não contém glúten");
  return estadoPerfil("atencao", c.t || c.al.length ? "Não achei glúten, mas a embalagem não confirma" : "Não deu pra confirmar");
}
function perfilLactose(c){
  const lim = c.sem.replace(LC_NEG, " ").replace(LEITE_NEG, " ");
  if (c.dito.lactose === true || LC_SIM.test(lim)) return estadoPerfil("nao", "O rótulo diz: contém lactose");
  if (c.lb.some(x => /^en:(no-lactose|lactose-free)$/.test(x))) return estadoPerfil("ok", "Selo de sem lactose");
  if (c.dito.lactose === false || c.t.search(LC_NEG) >= 0) return estadoPerfil("ok", "O rótulo diz: sem lactose");
  if (c.al.includes("en:milk") || c.alerg.includes("leite")) return estadoPerfil("nao", "Leite está nos alérgenos");
  const m = lim.match(LACTEO);
  if (m) return estadoPerfil("nao", "Tem " + (NOME_ING[m[1]] || m[1]) + " nos ingredientes");
  return c.temIng ? estadoPerfil("ok", "Sem leite nos ingredientes") : estadoPerfil("atencao", "Não deu pra confirmar");
}
function perfilAcucar(c){
  const s = c.n.sugars_100g, g = s == null || s === "" || !isFinite(+s) ? null : +s, q = g == null ? "" : g.toFixed(0) + " g em 100 g";
  if (c.add) return estadoPerfil("nao", "Tem açúcar adicionado");
  if (g != null && g >= 15) return estadoPerfil("nao", c.temIng ? "Muito açúcar, mesmo sendo natural (" + q + ")" : "Muito açúcar (" + q + ")");
  if (!c.temIng) return estadoPerfil("atencao", "Não deu pra confirmar");
  return g == null ? estadoPerfil("atencao", "Sem açúcar adicionado, mas não sei o total") : estadoPerfil("ok", "Sem açúcar adicionado (" + q + ")");
}
/* d = produto no formato OFF (tags, nutriments, _rotulo da API); texto = onde procurar; temIng = achou a lista;
   add = o motor achou açúcar adicionado. Qualquer "nao" → evitar; "atencao" → no máximo moderação. */
function aplicarPerfis(out, perfis, d, texto, temIng, add){
  const lig = PERFIS.filter(k => perfis && perfis[k]);
  if (!lig.length) return;
  const t = nrm(texto).replace(/\s+/g, " ").trim(), rot = d._rotulo || {}, tags = k => Array.isArray(d[k]) ? d[k].map(String) : [];
  const c = { t, temIng, add, dito: rot.contem || {}, alerg: (rot.alergenos || []).map(nrm), al: tags("allergens_tags"), tr: tags("traces_tags"), lb: tags("labels_tags"),
    tracos: (t.match(TRACOS) || []).join(" "), sem: t.replace(TRACOS, " "), n: d.nutriments || {} };
  out.perfis = lig.map(id => ({ id, ...(id === "gluten" ? perfilGluten(c) : id === "lactose" ? perfilLactose(c) : perfilAcucar(c)) }));
  const v0 = out.veredito;
  if (out.perfis.some(p => p.estado === "nao")) out.veredito = "evitar";
  else if (v0 === "comprar" && out.perfis.some(p => p.estado === "atencao")) out.veredito = "moderacao";
  if (out.veredito !== v0) out.resumo = out.veredito === "evitar" ? "Não serve pro seu perfil." : "Pelo rótulo tá bom, mas confira pro seu perfil.";
}

/* 👶 é calculado DEPOIS dos perfis: "serve" só se o veredito final é comprar (senão sairia "serve" ao lado de "Deixa na prateleira"). v0 = veredito antes dos perfis. */
function bebeDe(out, v0){
  const serve = out.veredito === "comprar";
  return { serve, motivo: serve ? "Sem açúcar adicionado, adoçante ou corante artificial." : out.veredito !== v0 ? (out.veredito === "evitar" ? "Não serve pro seu perfil alimentar." : "Confira o rótulo pro seu perfil alimentar.") : "Tem coisa que é melhor evitar pra idade dele." };
}
function avaliar(raw, isBaby, limpo, perfis){
  const ing = ingredientesDe(raw, limpo); const t = ing.texto; const full = nrm(raw);
  const vdAdd = full.match(/acucares adicionados[^%]{0,30}?(\d{1,3})\s*%/);
  const soTabela = !ing.achou && !!vdAdd;
  if (!ing.achou && !vdAdd) return { legivel: false, resumo: "Não achei a lista de ingredientes na foto. Tira mais de perto a parte escrita \"Ingredientes\", com luz e sem reflexo." };
  const L = ing.lista, top3 = L.slice(0, 3).join(" | ");
  const bons = [], ruins = [], dicas = []; let pts = 0;
  const bad = (p, msg, dica) => { pts += p; ruins.push(msg); if (dica) dicas.push(dica); };

  const acuRe = /(a[cg]ucar|azucar|xarope|jarabe|sacarose|glicose|glucosa|frutose|fructosa|maltodextrina|acucar invertido|dextrose)/;
  const acucarCedo = acuRe.test(top3), temAcucar = acuRe.test(t);
  const vd = vdAdd ? parseInt(vdAdd[1]) : null;
  if (vd != null && vd >= 20) bad(2, "Muito açúcar adicionado (" + vd + "% do dia numa porção)", "Uma porção já leva " + vd + "% do açúcar adicionado que dá pra comer no dia todo.");
  else if (vd != null && vd >= 8) bad(1, "Açúcar adicionado: " + vd + "% do dia por porção");
  if (soTabela) {} else if (acucarCedo) bad(2, "Açúcar/xarope entre os primeiros ingredientes", "Quando o açúcar aparece no começo da lista, ele é um dos ingredientes que mais tem.");
  else if (temAcucar) { if (vd == null) bad(1, "Tem açúcar adicionado"); }
  else if (vd == null || vd === 0) bons.push("Sem açúcar adicionado");

  const ado = ["aspartame","sucralose","acessulfame","acesulfame","esulfame","neotame","ciclamato","sacarina"].filter(x => t.includes(x));
  if (ado.length || /edulcorante/.test(t)) bad(2, "Adoçante artificial" + (ado.length ? " (" + [...new Set(ado.map(x => x === "esulfame" || x === "acesulfame" ? "acessulfame" : x))].join(", ") + ")" : ""), ado.includes("aspartame") ? "Aspartame é o adoçante mais ligado a queixa de dor de cabeça." : "Adoçante artificial deixa doce sem açúcar, mas não é o que a gente quer no natural.");
  else bons.push("Sem adoçante artificial");

  const cor = ["tartrazina","amarelo crepusculo","vermelho 40","bordeaux","ponceau","azul brilhante","azorrubina","eritrosina","caramelo iv","caramelo iii","indigotina"].filter(x => t.includes(x));
  if (cor.length || /corante artificial/.test(t)) bad(2, "Corante artificial" + (cor.length ? " (" + cor.join(", ") + ")" : ""), "Tartrazina e amarelo crepúsculo são corantes que em alguns países exigem alerta pra criança.");
  else if (/corante/.test(t)) ruins.push("Tem corante (parece natural)");

  const cons = ["benzoato","sorbato","nitrito","nitrato","dicarbonato","metabissulfito","propionato","bissulfito"].filter(x => t.includes(x));
  if (!cons.length && /conservador|conservante/.test(t)) cons.push("conservador");
  if (cons.length >= 2) bad(2, "Vários conservantes (" + cons.join(", ") + ")");
  else if (cons.length === 1) bad(1, cons[0] === "conservador" ? "Tem conservante" : "Tem conservante (" + cons[0] + ")");
  else bons.push("Sem conservante");

  if (/hidrogenada/.test(t)) bad(2, "Gordura hidrogenada", "Gordura hidrogenada é das piores coisas pra ter no rótulo.");
  else if (/gordura vegetal|oleo de palma|aceite vegetal|aceite de palma/.test(t)) bad(1, "Gordura vegetal/palma");

  if (/(artificial|identico ao natural)/.test(t) && /arom/.test(t)) bad(1, "Aromatizante artificial", "Aroma artificial imita o sabor, não é a fruta de verdade.");
  if (/glutamato|realcador de sabor/.test(t)) bad(1, "Realçador de sabor (glutamato)");
  if (/^.{0,12}soro de le/.test(L[0] || "")) bad(2, "Soro de leite é o 1º ingrediente", "Soro de leite em 1º lugar quer dizer bebida láctea, não leite de verdade.");

  const suco = t.match(/suco[^%]{0,40}?\(?\s*(\d+[.,]?\d*)\s*%/);
  if (suco && parseFloat(suco[1].replace(",", ".")) < 10) bad(2, "Pouquíssima fruta (" + suco[1] + "%)", "Rótulo com fruta desenhada e só " + suco[1] + "% de suco é praticamente água com açúcar.");

  const aditivos = (t.match(/(goma|carragena|carboximetilcelulose|polifosfato|edta|fosfato|citrato trissodico|lecitina|espessante|estabilizante|emulsificante|amido modificado)/g) || []).length;
  if (aditivos >= 4) bad(1, "Muitos espessantes/estabilizantes (" + aditivos + ")");

  if (/cafeina|guarana/.test(t) && isBaby) bad(2, "Tem cafeína");

  const n = L.length;
  if (soTabela) { ruins.push("Não consegui ler os ingredientes, só a tabela"); dicas.push("Pra análise completa, tira foto da lista de ingredientes também."); }
  if (!soTabela && n && n <= 5 && pts === 0) { bons.unshift("Lista curtinha (" + n + " ingredientes), comida de verdade"); dicas.unshift("Lista curta com tudo que dá pra reconhecer: esse é o tipo que vale levar."); }
  else if (!soTabela && n >= 14) bad(1, "Lista longa (" + n + " ingredientes)");

  let v = pts >= 3 ? "evitar" : pts >= 1 ? "moderacao" : "comprar";
  if (isBaby && pts >= 2) v = "evitar";
  const tipo = (TIPOS.find(([re]) => re.test(full)) || [0, "Produto"])[1];
  const resumo = v === "comprar" ? "Rótulo limpo, pode levar tranquilo." : v === "moderacao" ? "Não é dos piores, mas tem ressalvas. De vez em quando tá ok." : "Muita coisa industrial aqui. Melhor deixar na prateleira.";
  const comentario = (dicas.length ? dicas.slice(0, 2).join(" ") : "Nada que chame atenção no rótulo.") + (tipo !== "Produto" ? "" : "");
  const out = { legivel: true, produto: tipo, veredito: v, resumo, comentario, pontos_bons: bons.slice(0, 4), pontos_ruins: ruins.slice(0, 5), ingredientes: (soTabela || ing.semOrdem) ? "" : ing.texto.slice(0, 600), _pts: pts, _n: n };
  aplicarPerfis(out, perfis, {}, raw, ing.achou, (!soTabela && acucarAdicionado(t)) || (vd != null && vd > 0));
  if (isBaby) out.bebe = bebeDe(out, v);
  return out;
}
/* Com perfil ligado, quem falha num perfil ("nao") perde pra quem passa, antes da contagem de pontos. */
function comparar(a, b, isBaby, perfis){
  const lg = x => x && x.legivel !== false;
  const pf = PERFIS.some(k => perfis && perfis[k]);
  const tem = (x, e) => pf && !!(x && x.perfis && x.perfis.some(p => p.estado === e)), falha = x => tem(x, "nao");
  let melhor = "empate", porPerfil = false;
  if (lg(a) && lg(b) && falha(a) !== falha(b)) { melhor = falha(a) ? "b" : "a"; porPerfil = true; }
  else if (lg(a) && lg(b)) melhor = a._pts < b._pts ? "a" : b._pts < a._pts ? "b" : (a._n < b._n ? "a" : b._n < a._n ? "b" : "empate");
  else if (lg(a)) melhor = "a"; else if (lg(b)) melhor = "b";
  const w = melhor === "a" ? a : melhor === "b" ? b : null, l = melhor === "a" ? b : melhor === "b" ? a : null;
  const dif = [];
  if (porPerfil) l.perfis.filter(p => p.estado === "nao").slice(0, 1).forEach(p => dif.push("O outro: " + p.motivo.charAt(0).toLowerCase() + p.motivo.slice(1)));
  if (w && l && lg(l)) { l.pontos_ruins.filter(x => !w.pontos_ruins.includes(x)).slice(0, 3).forEach(x => dif.push("O outro: " + x.charAt(0).toLowerCase() + x.slice(1))); }
  const res = {
    a: { legivel: lg(a), produto: a && a.produto, veredito: a && a.veredito, resumo: a && a.resumo },
    b: { legivel: lg(b), produto: b && b.produto, veredito: b && b.veredito, resumo: b && b.resumo },
    melhor, motivo: porPerfil ? "O outro não serve pro seu perfil." : w ? "Rótulo mais limpo, com menos coisa industrial." : "Os dois ficaram parecidos pelo rótulo.",
    comentario: w && w.comentario, diferencas: dif.slice(0, 3),
    bebe: isBaby ? (w && w.veredito === "comprar" ? "O escolhido serve pro bebê." : "Nenhum dos dois é ideal pro bebê.") : null
  };
  if (pf) {
    const nenhum = estadoPerfil("nao", "Nenhum dos dois serve pro seu perfil.");
    res.perfis = w ? (falha(w) ? (lg(l) ? nenhum : estadoPerfil("nao", "O escolhido não serve pro seu perfil."))
        : tem(w, "atencao") ? estadoPerfil("atencao", "Confira o rótulo do escolhido pro seu perfil.") : estadoPerfil("ok", "O escolhido serve pro seu perfil."))
      : !lg(a) ? null : falha(a) ? nenhum : tem(a, "atencao") || tem(b, "atencao") ? estadoPerfil("atencao", "Confira o rótulo dos dois pro seu perfil.") : estadoPerfil("ok", "Os dois servem pro seu perfil.");
  }
  return res;
}

const ENUM = { e951:"aspartame", e955:"sucralose", e950:"acessulfame", e961:"neotame", e952:"ciclamato", e954:"sacarina",
  e102:"tartrazina", e110:"amarelo crepusculo", e129:"vermelho 40", e124:"ponceau", e133:"azul brilhante", e150c:"caramelo iii", e150d:"caramelo iv", e122:"azorrubina", e127:"eritrosina", e132:"indigotina",
  e211:"benzoato", e212:"benzoato", e202:"sorbato", e200:"sorbato", e250:"nitrito", e252:"nitrato", e251:"nitrato", e242:"dicarbonato", e223:"metabissulfito", e282:"propionato", e621:"glutamato" };
function analisarProduto(d, isBaby, perfis){
  const ing = d.ingredients_text_pt || d.ingredients_text || "";
  const extras = (d.additives_tags || []).map(t => ENUM[t.replace(/^en:/, "")]).filter(Boolean);
  const texto = (ing + (extras.length ? ", " + extras.join(", ") : "")).trim();
  let r;
  if (ing) r = avaliar(texto, isBaby, true);
  if (!r || r.legivel === false) r = { legivel: true, veredito: "moderacao", pontos_bons: [], pontos_ruins: ["A base não tem a lista de ingredientes desse produto"], comentario: "", _pts: 1, _n: 0, ingredientes: "" };
  const bons = r.pontos_bons || [], ruins = r.pontos_ruins || [];
  let pts = r._pts || 0;
  const nova = +d.nova_group || 0;
  if (nova === 4){ pts += 2; ruins.unshift("Ultraprocessado (NOVA 4)"); }
  else if (nova === 3){ pts += 1; ruins.unshift("Processado (NOVA 3)"); }
  else if (nova === 1){ bons.unshift("Alimento in natura ou minimamente processado (NOVA 1)"); }
  const n = d.nutriments || {};
  const acu = n.sugars_100g, sal = n.salt_100g, gs = n["saturated-fat_100g"];
  const acucarAdd = !ing || /(a[cg]ucar|xarope|sacarose|glicose|frutose|maltodextrina|dextrose|mel\b)/.test(nrm(ing));
  if (acu != null && acu >= 22.5 && acucarAdd){ pts += 1; ruins.push("Muito açúcar: " + (+acu).toFixed(0) + " g em 100 g"); }
  if (sal != null && sal >= 1.5){ pts += 1; ruins.push("Muito sal: " + (+sal).toFixed(1) + " g em 100 g"); }
  if (gs != null && gs >= 5){ ruins.push("Gordura saturada alta: " + (+gs).toFixed(0) + " g em 100 g"); }
  let v = pts >= 3 ? "evitar" : pts >= 1 ? "moderacao" : "comprar";
  if (isBaby && pts >= 2) v = "evitar";
  const coment = [];
  if (nova === 4) coment.push("NOVA 4 é a classificação de ultraprocessado: feito na indústria com ingredientes que você não tem em casa.");
  if (nova === 1) coment.push("NOVA 1 é comida de verdade, do jeito que vem da natureza ou quase.");
  if (r.comentario && r.comentario !== "Nada que chame atenção no rótulo.") coment.push(r.comentario);
  const resumo = v === "comprar" ? "Pode levar tranquilo." : v === "moderacao" ? "Não é dos piores, mas tem ressalvas. De vez em quando tá ok." : "Muita coisa industrial aqui. Melhor deixar na prateleira.";
  const out = { legivel: true, produto: nomeProd(d), imagem: d.image_front_small_url || "", veredito: v, resumo,
    comentario: coment.slice(0, 2).join(" ") || (ing ? "Rótulo sem nada que chame atenção." : ""), pontos_bons: bons.slice(0, 4), pontos_ruins: [...new Set(ruins)].slice(0, 6),
    ingredientes: ing.slice(0, 700), _pts: pts, _n: r._n || 0 };
  // texto inteiro do OFF (já é a lista): ingredientesDe corta antes de "ingrediente" e em 700 chars, e açúcar sumia
  aplicarPerfis(out, perfis, d, ing, !!ing, !!ing && acucarAdicionado(ing));
  if (isBaby) out.bebe = bebeDe(out, v);
  return out;
}

globalThis.Regras = { ingredientesDe, avaliar, comparar, analisarProduto };
