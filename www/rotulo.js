/* ---------- leitura do rótulo por REGRAS (sem IA) ----------
   Entra o texto que o aparelho leu (ML Kit no Android, "Escanear Texto" do iOS ou digitado)
   e sai: ingredientes limpos, alérgenos, lupa "ALTO EM" e se contém glúten/lactose.
   Script clássico (sem import/export): o app carrega com <script src="rotulo.js"> e a API
   (Worker) com `import "../../www/rotulo.js"`. Os dois usam globalThis.Rotulo.ler(texto).
   Tudo dentro da função pra não colidir com nomes do index.html. */
(function () {
  "use strict";

  /* minúsculas e sem acento, UM caractere por caractere: os índices batem com o texto original */
  function dobra(s) {
    let out = "";
    for (let i = 0; i < s.length; i++) {
      const f = s[i].normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
      out += f.length === 1 ? f : (f[0] || " ");
    }
    return out;
  }

  /* limpeza do texto inteiro: caracteres invisíveis, traços/aspas tortos, hifenização e quebras de linha */
  function preLimpa(bruto) {
    let t = String(bruto == null ? "" : bruto).normalize("NFC");
    t = t.replace(/\r\n?/g, "\n")
      .replace(/[​-‍⁠﻿­]/g, "")
      .replace(/[\t\f\v  -   　]/g, " ")
      .replace(/[‐-―−]/g, "-")
      .replace(/[‘’‛´`]/g, "'")
      .replace(/[“”«»]/g, '"')
      .replace(/[•●▪■◦]/g, ",");
    // "EMULSIFI-\nCANTE" → "EMULSIFICANTE"; "castanha-\nde-caju" mantém o hífen
    t = t.replace(/(\p{L})-[ ]*\n[ ]*(?=(\p{L}+))/gu, (m, a, prox) => /^(de|do|da|dos|das|e)$/i.test(prox) ? a + "-" : a);
    return t.replace(/[ ]*\n+[ ]*/g, " ").replace(/ {2,}/g, " ").trim();
  }

  /* cabeçalho "INGREDIENTES:" (com os erros comuns do OCR: I↔1↔l↔|) */
  const RE_INGR = /(?<![a-z0-9])[i1l|]ngred[i1l|]en?t[e3]?s?(?![a-z])/g;
  const RE_PULA = /^[\s:;.\-\/]*(?:[i1l|]ngred[i1l|]en?t[e3]?s?(?![a-z])[\s:;.\-]*)?/; // "Ingredientes/Ingredients:"

  /* onde a lista acaba. [regex no texto dobrado, "local"] — local = não corta se estiver dentro de parênteses,
     ex.: "chocolate (contém leite)" */
  const FIM = [
    [/(?<![a-z])alerg[i1l]c|(?<![a-z])alergen/g, true],
    [/(?<![a-z])podem? conter(?![a-z])/g, true],
    [/(?<![a-z])(?:nao )?cont[e3]m(?![a-z])/g, true],
    [/(?<![a-z0-9])[i1l|]ngred[i1l|]ent/g, false], // a lista de novo, em outro idioma
    [/informacao nutricional|tabela nutricional|nutrition facts|informacion nutricional/g, false],
    [/(?<![a-z])porcao(?![a-z])|(?<![a-z])porcion(?![a-z])|valor(?:es)? energetic|valores? diarios?|%\s?vd(?![a-z])|(?<![a-z])kcal(?![a-z])/g, false],
    [/(?<![a-z])alto ?em(?![a-z])/g, false],
    [/(?<![a-z])modo de (?:preparo|preparar|usar|uso|conservar|conservacao)|(?<![a-z])(?:conservar|conserve|conservacao|validade|consumir)(?![a-z])|(?<![a-z])apos aberto/g, false],
    [/(?<![a-z])(?:fabricad[oa]|produzid[oa]|distribuid[oa]|embalad[oa]|importad[oa]) (?:por|e)(?![a-z])|(?<![a-z])(?:fabricacao|lote|sac|cnpj|cep)(?![a-z])|industria brasileira|(?<![a-z])peso liquido/g, false],
    [/(?<![a-z])(?:colorido|aromatizado) artificialmente/g, false],
    [/(?<![a-z])www\.|https?:/g, false],
  ];

  /* true se a posição i está dentro de um "( ... )" próximo */
  function dentroParenteses(f, i) {
    const antes = f.slice(Math.max(0, i - 80), i), depois = f.slice(i, i + 80);
    if (antes.lastIndexOf("(") <= antes.lastIndexOf(")")) return false;
    const fecha = depois.indexOf(")"), abre = depois.indexOf("(");
    return fecha >= 0 && (abre < 0 || fecha < abre);
  }

  function achaFim(f, ini) {
    let fim = f.length;
    for (const [re, local] of FIM) {
      re.lastIndex = ini;
      let m;
      while ((m = re.exec(f)) && m.index < fim) {
        if (!(local && dentroParenteses(f, m.index))) { fim = m.index; break; }
      }
    }
    return fim;
  }

  /* lixo de OCR, espaços e pontuação; rótulo TODO EM MAIÚSCULA vira frase normal */
  function limpaLista(s) {
    s = s.replace(/[^\p{L}\p{N}\s,.;:()\[\]%\/\-'&+*]/gu, " ");
    s = s.split(/\s+/).filter(w => w && (/[\p{L}\p{N}]/u.test(w) || /^[,;.:()%&]+$/.test(w))).join(" ");
    s = s.replace(/\s+([,.;:)\]%])/g, "$1")
      .replace(/([(\[])\s+/g, "$1")
      .replace(/,(?=\S)/g, (m, i, str) => /\d/.test(str[i - 1] || "") && /\d/.test(str[i + 1] || "") ? "," : ", ")
      .replace(/;(?=\S)/g, "; ")
      .replace(/([,;:.])(?:\s*[,;:])+/g, "$1")
      .replace(/\(\s*\)/g, "")
      .replace(/\s{2,}/g, " ")
      .replace(/^[\s,.;:\-)\]]+/, "")
      .replace(/[\s,;:\-(\[]+$/, "")
      .trim();
    const up = (s.match(/\p{Lu}/gu) || []).length, lo = (s.match(/\p{Ll}/gu) || []).length;
    if (up + lo > 10 && up > 0.7 * (up + lo)) {
      s = s.toLowerCase()
        .replace(/(?<![\p{L}])ins(?![\p{L}])/gu, "INS")
        .replace(/(?<![\p{L}])(vitaminas?) ([abcdek])(\d{0,2})(?![\p{L}\d])/gu, (m, v, l, n) => v + " " + l.toUpperCase() + n)
        .replace(/^\P{L}*\p{L}/u, c => c.toUpperCase());
    }
    return s;
  }

  function achaIngredientes(t, f) {
    RE_INGR.lastIndex = 0;
    const m = RE_INGR.exec(f);
    let ini = 0;
    if (m) { ini = m.index + m[0].length; ini += RE_PULA.exec(f.slice(ini))[0].length; }
    const s = limpaLista(t.slice(ini, achaFim(f, ini)));
    if (s.replace(/\P{L}/gu, "").length < 3) return null;
    // sem o cabeçalho, só aceita se tem cara de lista (vírgula) ou é curto ("leite integral")
    if (!m && !/,/.test(s) && s.length > 60) return null;
    return s;
  }

  /* alérgenos da lista oficial (RDC 26/2015), só do "CONTÉM"; "PODE CONTER" (traços) fica de fora */
  const ALERG = [
    ["trigo", /(?<![a-z])trigo(?![a-z])/], ["centeio", /(?<![a-z])centeio/], ["cevada", /(?<![a-z])cevada/],
    ["aveia", /(?<![a-z])aveia/], ["crustáceos", /(?<![a-z])crustace/], ["ovos", /(?<![a-z])ovos?(?![a-z])/],
    ["peixes", /(?<![a-z])peixes?(?![a-z])/], ["amendoim", /(?<![a-z])amendoi[mn]/], ["soja", /(?<![a-z])soja(?![a-z])/],
    ["leite", /(?<![a-z])leites?(?![a-z])/], ["amêndoa", /(?<![a-z])amendoas?(?![a-z])/], ["avelã", /(?<![a-z])avelas?(?![a-z])/],
    ["castanha-de-caju", /(?<![a-z])caju(?![a-z])/], ["castanha-do-pará", /castanhas?[- ]d[oa][- ](?:para|brasil)(?![a-z])/],
    ["macadâmia", /(?<![a-z])macadamia/], ["nozes", /(?<![a-z])noz(?:es)?(?![a-z])/], ["pecã", /(?<![a-z])pecas?(?![a-z])/],
    ["pistache", /(?<![a-z])pistache/], ["pinoli", /(?<![a-z])(?:pinoli|pinhao|pinhoes)/], ["látex natural", /(?<![a-z])latex(?![a-z])/],
  ];
  function achaAlergenos(f) {
    const segs = [];
    const re = /(?<![a-z])alerg[i1l]c[a-z]*|(?<![a-z])alergen[a-z]*|(?<!nao )(?<![a-z])cont[e3]m(?![a-z])/g;
    let m;
    while ((m = re.exec(f))) {
      const ini = m.index + m[0].length;
      let fim = Math.min(f.length, ini + 200);
      const corte = f.slice(ini, fim).search(/\.(?:\s|$)|[()]|(?<![a-z])podem? conter|(?<![a-z])tracos?(?![a-z])/);
      if (corte >= 0) fim = ini + corte;
      segs.push(f.slice(ini, Math.min(fim, achaFim(f, ini))));
    }
    const txt = segs.join(" | ");
    const achou = ALERG.filter(([, re2]) => re2.test(txt)).map(([nome]) => nome);
    if (/(?<![a-z])castanhas?(?![a-z])/.test(txt) && !achou.some(a => a.startsWith("castanha"))) achou.push("castanhas");
    return achou;
  }

  /* lupa frontal: "ALTO EM AÇÚCAR ADICIONADO / GORDURA SATURADA / SÓDIO" */
  function achaAltoEm(f) {
    const achou = new Set();
    const re = /(?<![a-z])alto ?em(?![a-z])/g;
    let m;
    while ((m = re.exec(f))) {
      const palavras = f.slice(m.index + m[0].length, m.index + m[0].length + 80).split(/[^a-z0-9]+/).filter(Boolean);
      for (const w of palavras) {
        if (/^a[cs]uca/.test(w)) achou.add("acucar_adicionado");
        else if (/^g[o0]rdur/.test(w)) achou.add("gordura_saturada");
        else if (/^s[o0]di/.test(w)) achou.add("sodio");
        else if (!(w === "e" || w === "em" || w === "alto" || /^adicionad/.test(w) || /^saturad/.test(w))) break;
      }
    }
    return ["acucar_adicionado", "gordura_saturada", "sodio"].filter(k => achou.has(k));
  }

  /* "CONTÉM GLÚTEN" → true · "NÃO CONTÉM GLÚTEN" / "sem"/"zero" → false · nada escrito → null */
  function simNao(f, palavra) {
    const neg = new RegExp("(?<![a-z])(?:nao cont[e3]m|sem|zero|isent[oa] de|livre de) ?" + palavra + "(?![a-z])", "g");
    const pos = new RegExp("(?<![a-z])cont[e3]m ?" + palavra + "(?![a-z])");
    const temNeg = neg.test(f);
    if (pos.test(f.replace(neg, " "))) return true;
    return temNeg ? false : null;
  }

  function ler(texto) {
    const t = preLimpa(texto), f = dobra(t);
    return {
      ingredientes: achaIngredientes(t, f),
      alergenos: achaAlergenos(f),
      altoEm: achaAltoEm(f),
      contem: { gluten: simNao(f, "glute[nm]"), lactose: simNao(f, "lactose") },
    };
  }

  globalThis.Rotulo = { ler };
})();
