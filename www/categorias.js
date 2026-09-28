/* Leva ou não? — regras por categoria (Fase 3: qualquer código de barras). Sem IA.
   Script clássico: carrega antes do app e expõe globalThis.Categorias. Tudo dentro da IIFE
   porque const de topo em script clássico divide escopo com o index.html (nome repetido = erro).

   A categoria chega da busca em d._categoria: alimento | cosmetico | pet | limpeza | remedio (sem = alimento).
   avaliar(d) devolve o MESMO formato do avaliar()/analisarProduto() de alimento:
     { legivel, produto, imagem, veredito:"comprar"|"moderacao"|"evitar", resumo, comentario,
       pontos_bons[], pontos_ruins[], ingredientes, _pts, _n }   (sem `bebe`: modo bebê é só alimento)
   remedio(d) NUNCA dá veredito: { remedio:true, legivel:true, produto, imagem, linhas:[[rótulo, valor]] }.

   Pesos: 3 = "deixa na prateleira" direto; 1-2 = ressalva. Cosmético e limpeza não viram "deixa" por
   acúmulo de ressalva (quase todo xampu/detergente tem perfume + corante: somar tiraria o sinal);
   pet soma como alimento (é a comida de todo dia do bicho). */
(function(){
"use strict";

const CATS = ["alimento","cosmetico","pet","limpeza","remedio"];
const ICONE = { alimento:"🍎", cosmetico:"🧴", pet:"🐾", limpeza:"🧽", remedio:"💊" };
const NOME = { alimento:"Alimento", cosmetico:"Cosmético", pet:"Pet", limpeza:"Limpeza", remedio:"Remédio" };
// Crédito ODbL: cada base irmã do Open Food Facts tem o próprio site. Remédio = lista de preços da CMED.
const FONTE = {
  alimento:  ["Open Food Facts",     c => "https://br.openfoodfacts.org/produto/" + c],
  cosmetico: ["Open Beauty Facts",   c => "https://world.openbeautyfacts.org/product/" + c],
  pet:       ["Open Pet Food Facts", c => "https://world.openpetfoodfacts.org/product/" + c],
  limpeza:   ["Open Products Facts", c => "https://world.openproductsfacts.org/product/" + c],
  remedio:   ["CMED/Anvisa",         () => "https://www.gov.br/anvisa/pt-br/assuntos/medicamentos/cmed/precos"]
};

const nrm = s => String(s == null ? "" : s).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
const categoria = d => (d && CATS.includes(d._categoria)) ? d._categoria : "alimento";
const nome = d => {
  const n = d.product_name_pt || d.product_name || d.generic_name_pt || "Produto", m = d.brands && String(d.brands).split(",")[0].trim();
  return m && !nrm(n).includes(nrm(m)) ? n + " · " + m : n;
};
const rawIng = d => d.ingredients_text_pt || d.ingredients_text || d.ingredients_text_en || "";

// Texto normalizado + lista na ordem do rótulo (vírgula dentro de parênteses não separa).
function ler(raw){
  let t = nrm(raw).replace(/\s+/g, " ").trim();
  const cab = t.match(/^.{0,40}?(ingredientes?|ingredients?|composicao|inci)\s*:\s*/);
  if (cab) t = t.slice(cab[0].length);
  return { t, L: t.split(/[,;•·](?![^(]*\))/).map(x => x.trim()).filter(x => x.length > 1) };
}

/* Motor genérico. Regra = { itens:[[regex, rótulo]], p: peso ou (ctx, qtd) => peso (0 = não conta),
   m: texto ou (ctx) => texto, dica?, tag? }. Lista os achados entre parênteses (até 3). */
function rodar(regras, t, ctx){
  let pts = 0, grave = false; const ruins = [], dicas = [], bateu = new Set();
  regras.forEach(r => {
    const ach = [...new Set(r.itens.filter(([re]) => re.test(t)).map(([, l]) => l))];
    if (!ach.length) return;
    const p = typeof r.p === "function" ? r.p(ctx, ach.length) : r.p;
    if (!p) return;
    pts += p; if (p >= 3) grave = true;
    if (r.tag) bateu.add(r.tag);
    const m = typeof r.m === "function" ? r.m(ctx) : r.m;
    const soOMesmo = ach.length === 1 && nrm(m).includes(nrm(ach[0]));   // "Libera formol (formol)" não
    ruins.push(r.lista === false || soOMesmo ? m : m + " (" + ach.slice(0, 3).join(", ") + ")");
    if (r.dica) dicas.push(typeof r.dica === "function" ? r.dica(ctx) : r.dica);
  });
  return { pts, grave, ruins, dicas, bateu };
}
function veredito(pts, grave, limite){ return grave || pts >= limite ? "evitar" : pts >= 1 ? "moderacao" : "comprar"; }

/* ---------- cosmético (INCI) ----------
   Critério: deixa = proibido/restrito na UE (Reg. 1223/2009, pareceres do SCCS) ou suspeito de
   desregular hormônio com alternativa fácil; moderação = irritante/alérgeno de contato comum. */
const COSMETICO = [
  { p:3, tag:"cons", m:"Parabeno controverso",
    dica:"Propil e butilparabeno são suspeitos de mexer com hormônio; metil e etilparabeno não preocupam.",
    itens:[[/(^|[^o])propyl[\s-]*paraben|(^|[^o])propil[\s-]*parabeno/, "propilparabeno"],
           [/(^|[^o])butyl[\s-]*paraben|(^|[^o])butil[\s-]*parabeno/, "butilparabeno"],
           [/isobutyl[\s-]*paraben|isobutil[\s-]*parabeno/, "isobutilparabeno"],
           [/isopropyl[\s-]*paraben|isopropil[\s-]*parabeno/, "isopropilparabeno"]] },
  { p:3, tag:"cons", m:"Libera formol",
    dica:"Esse conservante solta formol aos poucos dentro do produto: irrita a pele e formol é cancerígeno.",
    itens:[[/dmdm[\s-]*h[iy]dantoin/, "DMDM hidantoína"], [/(^|[^y])quaternium[\s-]*15\b/, "quaternium-15"],
           [/imidazolidin[iy]l[\s-]*ure/, "imidazolidinil ureia"], [/diazolidin[iy]l[\s-]*ure/, "diazolidinil ureia"],
           [/bronopol|2-bromo-2-nitropropan/, "bronopol"], [/hydroxymethylglycinate|hidroximetilglicinato/, "hidroximetilglicinato"],
           [/formaldehyde|formaldeido|\bformol\b|\bformalin|methylene glycol|metilenoglicol/, "formol"]] },
  { p:3, tag:"cons", m:"Antibacteriano controverso",
    dica:"Triclosan foi proibido em sabonete nos EUA: não limpa melhor que sabão comum e é suspeito de mexer com hormônio.",
    itens:[[/triclosan/, "triclosan"], [/triclocarban/, "triclocarban"]] },
  { p:3, tag:"cons", m:"BHA", lista:false,
    dica:"BHA é possível cancerígeno (IARC 2B) e suspeito de mexer com hormônio.",
    itens:[[/\bbha\b|butylated hydroxyanisole|hidroxianisol|butil[\s-]*hidroxi[\s-]*anisol/, "BHA"]] },
  { p:3, m:"Oxibenzona (filtro solar controverso)", lista:false,
    dica:"Oxibenzona é suspeita de mexer com hormônio. Protetor solar continua importante: procura um sem ela.",
    itens:[[/oxybenzone|oxibenzona|benzophenone[\s-]*3\b|benzofenona[\s-]*3\b/, "oxibenzona"]] },
  { p:3, tag:"cons", m:"Conservante que mais dá alergia",
    dica:"MIT/MCI virou campeão de alergia de contato; a Europa proibiu em creme que fica na pele.",
    itens:[[/methylchloroisothiazolinone|metilcloroisotiazolinona/, "MCI"], [/methylisothiazolinone|metilisotiazolinona/, "MIT"], [/kathon/, "Kathon"]] },
  { p:3, m:"Proibido em cosmético na Europa",
    itens:[[/hydroquinone|hidroquinona/, "hidroquinona"], [/dibutyl phthalate|ftalato de dibutila|\bdbp\b/, "ftalato DBP"],
           [/diethylhexyl phthalate|ethylhexyl phthalate|\bdehp\b/, "ftalato DEHP"],
           [/butylphenyl methylpropional|\blilial/, "lilial"], [/hydroxyisohexyl 3-cyclohexene|\blyral/, "lyral"]] },
  { p:1, tag:"perf", m:"Tem perfume", lista:false,
    dica:"Perfume é a causa nº 1 de alergia a cosmético: pele sensível vai melhor sem.",
    itens:[[/\b(parfum|fragrance|fragrancia|perfume|essencia)\b/, "perfume"]] },
  { p:1, tag:"perf", m:"Alérgeno de perfume",
    itens:[[/\blimonene\b|\blimoneno\b/, "limonene"], [/\blinalo[o]?l\b/, "linalool"], [/citronellol|citronelol/, "citronellol"],
           [/\bgeraniol\b/, "geraniol"], [/\b(iso)?eugenol\b/, "eugenol"], [/coumarin|cumarina/, "cumarina"], [/\bcinnamal\b|cinamal\b|cinnamyl alcohol/, "cinnamal"],
           [/\bcitral\b/, "citral"], [/\bfarnesol\b/, "farnesol"], [/hydroxycitronellal/, "hydroxycitronellal"], [/(amyl|hexyl) ?cinnamal/, "cinnamal"],
           [/benzyl (salicylate|benzoate|cinnamate)/, "benzílicos"], [/isomethyl ionone/, "ionone"], [/evernia/, "musgo de carvalho"]] },
  { p:1, m:"Lauril sulfato (resseca e irrita)", lista:false,
    itens:[[/lauryl sulfate|lauril sulfato/, "SLS"]] },
  { p:1, m:"PPD (tintura que dá alergia forte)", lista:false,
    dica:"Tintura com PPD: faz o teste de mecha 48 h antes.",
    itens:[[/phenylenediamine|fenilenodiamina|\bppd\b/, "PPD"]] }
];
const RESUMO_COSM = { comprar:"Fórmula sem os ingredientes que preocupam. Pode levar.",
  moderacao:"Tem ingrediente que irrita pele sensível. Se você já usa sem problema, tá ok.",
  evitar:"Tem ingrediente controverso na fórmula. Melhor procurar outro." };

/* ---------- pet ----------
   Critério: tóxico pra espécie (xilitol → cão; propilenoglicol → gato, proibido pelo FDA em comida de gato;
   cebola/alho, chocolate, uva → cão e gato) = deixa; etoxiquina = suspensa na UE; resto é qualidade da ração. */
function especie(d){
  const s = nrm([(d.categories_tags || []).join(" "), d.product_name, d.product_name_pt, d.generic_name_pt].join(" ")).replace(/[-:_]/g, " ");
  const cao = /\b(dogs?|puppy|puppies|chiens?|caes|cao|cachorros?|caninos?|canine|perros?)\b/.test(s);
  const gato = /\b(cats?|kittens?|chats?|gatos?|gatinhos?|felinos?|feline)\b/.test(s);
  return cao && !gato ? "cao" : gato && !cao ? "gato" : null;
}
const NOMEADO = /(frango|galinha|aves|chicken|poultry|bovin|\bboi\b|beef|suin|porco|pork|peixe|fish|salmao|salmon|atum|tuna|sardinha|cordeiro|lamb|ovin|\bperu\b|turkey|\bpato\b|duck|coelho|rabbit|vitela|veal|leite|milk|\bovos?\b|\beggs?\b)/;
const PET = [
  { p:ctx => ctx.esp === "gato" ? 1 : 3, m:ctx => ctx.esp === "gato" ? "Xilitol (tóxico pra cão: não dá pro cachorro)" : "Xilitol: tóxico pra cão", lista:false,
    dica:"Xilitol derruba o açúcar do sangue do cachorro e pode lesar o fígado, mesmo em pouca quantidade.",
    itens:[[/xylitol|xilitol/, "xilitol"]] },
  { p:3, m:"Tóxico pra cão e gato",
    dica:"Cebola e alho estragam as hemácias (anemia) do cão e, mais ainda, do gato.",
    itens:[[/\b(cebola|onions?)\b/, "cebola"], [/\b(alho|garlic)\b/, "alho"], [/\b(chocolate|cacau|cocoa|cacao)\b/, "chocolate"],
           [/\b(uvas?|passas?|grapes?|raisins?)\b/, "uva/passa"], [/macadami/, "macadâmia"], [/cafeina|caffeine|guarana/, "cafeína"]] },
  { p:ctx => ctx.esp === "gato" ? 3 : ctx.esp === "cao" ? 0 : 1, lista:false,
    m:ctx => ctx.esp === "gato" ? "Propilenoglicol: proibido em comida de gato" : "Propilenoglicol (não serve pra gato)",
    dica:ctx => ctx.esp === "gato" ? "Propilenoglicol causa anemia em gato; nos EUA é proibido em comida de gato." : "Se tiver gato em casa, não dá isso pra ele.",
    itens:[[/propylene glycol|propilenoglicol|propileno glicol/, "propilenoglicol"]] },
  { p:3, tag:"cons", m:"Etoxiquina (conservante suspenso na Europa)", lista:false,
    itens:[[/ethoxyquin|etoxiquina/, "etoxiquina"]] },
  { p:(ctx, q) => q, tag:"cons", m:"Conservante sintético",
    dica:"BHA e BHT seguram a gordura da ração, mas BHA é possível cancerígeno; tem ração com vitamina E no lugar.",
    itens:[[/\bbha\b|butylated hydroxyanisole|hidroxianisol|butil[\s-]*hidroxi[\s-]*anisol/, "BHA"],
           [/\bbht\b|butylated hydroxytoluene|hidroxitolueno|butil[\s-]*hidroxi[\s-]*tolueno/, "BHT"]] },
  { p:2, tag:"cor", m:"Corante artificial",
    dica:"Cor na ração é pro dono, não pro bicho: ele não liga.",
    itens:[[/tartrazin/, "tartrazina"], [/amarelo crepusculo|sunset yellow/, "amarelo crepúsculo"], [/vermelho 40|red 40|allura/, "vermelho 40"],
           [/azul brilhante|brilliant blue/, "azul brilhante"], [/indigotin/, "indigotina"], [/eritrosin|erythrosin/, "eritrosina"],
           [/ponceau/, "ponceau"], [/carame(lo|l) i[v3]/, "caramelo IV"], [/dioxido de titanio|titanium dioxide/, "dióxido de titânio"],
           [/corante artificial|artificial colou?r/, "corante artificial"],
           // o lookbehind evita "vitamina E 110 UI" (enriquecimento) virar corante E110
           [/(?<!vitamina |vit\.? )\be ?1(02|10|22|24|27|29|32|33|71)\b/, "corante (E1xx)"]] }
];
const RESUMO_PET = { comprar:"Ração sem os aditivos que preocupam. Pode levar.",
  moderacao:"Não é das piores, mas tem ressalvas. Ok se o bicho vai bem com ela.",
  evitar:"Tem coisa que faz mal pro bicho. Deixa na prateleira." };

/* ---------- limpeza ----------
   A base tem pouca informação; quando tem ingrediente, é conservador: alquilfenol etoxilado (proibido em
   detergente na UE, 2003/53/CE), formol e triclosan = deixa; perfume, corante, fosfato (polui rio) e
   MIT/MCI (alergia de contato: usar luva) = ressalva. */
const LIMPEZA = [
  { p:3, m:"Alquilfenol etoxilado (proibido na Europa)", lista:false,
    dica:"Alquilfenol vira nonilfenol na água: mexe com hormônio de peixe e de gente; a Europa proibiu em detergente.",
    itens:[[/nonylphenol|nonilfenol|octylphenol|octilfenol|alquilfenol|alkylphenol|nonoxynol|nonoxinol/, "alquilfenol"]] },
  { p:3, m:"Libera formol",
    itens:[[/formaldehyde|formaldeido|\bformol\b|\bformalin|\bmetanal\b/, "formol"], [/dmdm[\s-]*h[iy]dantoin/, "DMDM hidantoína"], [/bronopol/, "bronopol"]] },
  { p:3, m:"Triclosan (antibacteriano que fica no ambiente)", lista:false,
    itens:[[/triclosan|triclocarban/, "triclosan"]] },
  { p:1, m:"Conservante que dá alergia na pele",
    dica:"MIT/MCI é o conservante que mais dá alergia de contato: usa luva.",
    itens:[[/methylchloroisothiazolinone|metilcloroisotiazolinona/, "MCI"], [/methylisothiazolinone|metilisotiazolinona/, "MIT"],
           [/benzisothiazolinone|benzisotiazolinona/, "BIT"], [/kathon/, "Kathon"]] },
  { p:1, tag:"perf", m:"Tem perfume", lista:false,
    itens:[[/\b(parfum|fragrance|fragrancia|perfume|essencia|aroma)\b/, "perfume"]] },
  { p:1, tag:"cor", m:"Tem corante", lista:false,
    itens:[[/\b(corantes?|colorants?|dyes?)\b|\bci ?\d{5}\b/, "corante"]] },
  { p:1, tag:"fosf", m:"Fosfato (polui rio e lago)", lista:false,
    itens:[[/fosfato|phosphate|\bstpp\b/, "fosfato"]] }
];
const RESUMO_LIMP = { comprar:"Fórmula sem os ingredientes que mais preocupam. Pode levar.",
  moderacao:"Tem ressalvas: usa com luva e em lugar arejado.",
  evitar:"Tem ingrediente que agride você ou o ambiente. Melhor outro." };

// Sem ingrediente na base = "sem dados", do mesmo jeito que o app faz com alimento.
function semDados(d, cat){
  return { legivel: true, produto: nome(d), imagem: d.image_front_small_url || "", veredito: "moderacao",
    resumo: "Sem a lista de ingredientes não dá pra cravar.", comentario: "",
    pontos_bons: [], pontos_ruins: ["A base não tem a lista de ingredientes desse produto"], ingredientes: "",
    _pts: 1, _n: 0, _icone: cat === "pet" ? iconePet(d) : ICONE[cat] };
}
const iconePet = d => { const e = especie(d); return e === "cao" ? "🐶" : e === "gato" ? "🐱" : ICONE.pet; };

function avaliar(d){
  const cat = categoria(d);
  if (cat === "remedio") return remedio(d);
  if (cat === "alimento") return null;                  // alimento = analisarProduto() do app
  const raw = rawIng(d);
  const { t, L } = ler(raw);
  if (!t || L.length === 0) return semDados(d, cat);
  const bons = [];
  let r, v, resumo, icone = ICONE[cat];
  if (cat === "cosmetico"){
    r = rodar(COSMETICO, t, {});
    if (!r.bateu.has("perf")) bons.push("Sem perfume");
    if (!r.bateu.has("cons")) bons.push("Sem conservante controverso");
    v = veredito(r.pts, r.grave, Infinity); resumo = RESUMO_COSM[v];
  } else if (cat === "pet"){
    const esp = especie(d); icone = iconePet(d);
    const tp = t.replace(/(extrato de )?semente de uva|grape ?seed( extract)?/g, " ");   // semente de uva é antioxidante, não é a fruta
    r = rodar(PET, tp, { esp });
    const acuRe = /\b(acucar|sugar|sacarose|sucrose|xarope|syrups?|glicose|glucose|frutose|fructose|dextrose|melaco|molasses)\b/;
    if (acuRe.test(L.slice(0, 3).join(" | "))){ r.pts += 2; r.ruins.push("Açúcar/xarope entre os primeiros ingredientes"); r.dicas.push("Ração não precisa de açúcar: ele só engorda e estraga o dente."); }
    else if (acuRe.test(tp)){ r.pts += 1; r.ruins.push("Tem açúcar/xarope"); }
    else bons.push("Sem açúcar");
    const gen = L.filter(x => /(subproduto|by-?product|derivado|digest|visceras|farinha de carne|meat meal|gordura animal|animal fat|proteina animal|animal protein)/.test(x) && !NOMEADO.test(x));
    if (gen.length){ r.pts += 1; r.ruins.push("Subproduto sem dizer de qual animal"); r.dicas.push("Quando o rótulo não diz de qual animal vem, a qualidade muda de lote pra lote."); }
    const prim = L[0] || "";
    if (/\b(milho|corn|maize|trigo|wheat|quirera|sorgo|sorghum|cereais|cereals)\b/.test(prim)){ r.pts += 1; r.ruins.push(esp === "gato" ? "Cereal é o 1º ingrediente (gato é carnívoro)" : "Cereal é o 1º ingrediente"); }
    else if (NOMEADO.test(prim) && !/(subproduto|by-?product|derivado)/.test(prim)) bons.unshift("1º ingrediente é proteína animal com nome");
    if (!r.bateu.has("cons")) bons.push("Sem conservante sintético");
    if (!r.bateu.has("cor")) bons.push("Sem corante artificial");
    v = veredito(r.pts, r.grave, 3); resumo = RESUMO_PET[v];
  } else {
    r = rodar(LIMPEZA, t, {});
    if (!r.bateu.has("perf")) bons.push("Sem perfume");
    if (!r.bateu.has("cor")) bons.push("Sem corante");
    if (!r.bateu.has("fosf")) bons.push("Sem fosfato");
    v = veredito(r.pts, r.grave, Infinity); resumo = RESUMO_LIMP[v];
  }
  const n = L.length;
  if (r.pts === 0 && n <= 8) bons.unshift("Fórmula curtinha (" + n + " ingredientes)");
  return { legivel: true, produto: nome(d), imagem: d.image_front_small_url || "", veredito: v, resumo,
    comentario: r.dicas.slice(0, 2).join(" ") || (r.ruins.length ? "" : "Nada que chame atenção na fórmula."),
    pontos_bons: bons.slice(0, 4), pontos_ruins: [...new Set(r.ruins)].slice(0, 6),
    ingredientes: String(raw).slice(0, 700), _pts: r.pts, _n: n, _icone: icone };
}

/* ---------- remédio: só informação (CMED/Anvisa), nunca veredito ---------- */
function num(x){
  if (typeof x === "number") return x;
  const s = String(x == null ? "" : x).replace(/[^\d,.-]/g, "");
  if (!s) return NaN;
  return parseFloat(s.includes(",") ? s.replace(/\./g, "").replace(",", ".") : s);
}
function preco(pmc, icms){
  const x = num(pmc);
  if (!isFinite(x) || x <= 0) return "";
  let s = x.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  let a = num(icms);
  if (isFinite(a) && a >= 0){ if (a > 0 && a < 1) a *= 100; s += " (ICMS " + String(+a.toFixed(1)).replace(".", ",") + "%)"; }
  return s;
}
function remedio(d){
  const linhas = [];
  const add = (k, v) => { v = String(v == null ? "" : v).trim(); if (v) linhas.push([k, v]); };
  add("Princípio ativo", d.principio_ativo);
  add("Apresentação", d.apresentacao);
  add("Laboratório", d.laboratorio);
  add("Preço máximo", preco(d.pmc, d.pmc_icms));
  return { remedio: true, legivel: true, produto: d.product_name || d.principio_ativo || "Remédio",
    imagem: d.image_front_small_url || "", linhas, _icone: ICONE.remedio };
}

globalThis.Categorias = {
  ICONE, NOME, categoria, especie, avaliar, remedio,
  icone: (cat, r) => (r && r._icone) || ICONE[cat] || "",
  fonte: (cat, code) => { const f = FONTE[cat] || FONTE.alimento; return { nome: f[0], url: f[1](code) }; }
};
})();
