/* Leva ou não? — "Tem melhor?": dado o produto, monta a busca de trocas na mesma categoria e escolhe as
   que o motor de regras aprova. Funções puras, sem DOM, sem rede (o fetch e a tela ficam no index.html).
   Script clássico (sem import/export), carrega depois do regras.js; `globalThis.Troca` é a porta pro teste
   em Node (tests/troca.test.mjs). Mudou o que o motor lê (regras.js analisarProduto)? Ajuste CAMPOS. */
globalThis.Troca = (() => {
  const nrm = s => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
  const so = s => String(s == null ? "" : s).replace(/\D/g, "");
  const igual = (a, b) => a.replace(/^0+/, "") === b.replace(/^0+/, "");   // UPC-A (12) e EAN-13 com 0 na frente são o mesmo produto

  // Só o que analisarProduto lê (ingredientes, aditivos, NOVA, nutrientes, alérgenos/traços/selos dos perfis) + o que a linha mostra.
  const CAMPOS = ["code", "product_name", "product_name_pt", "brands", "ingredients_text_pt", "ingredients_text", "additives_tags", "nova_group", "nutriments", "allergens_tags", "traces_tags", "labels_tags"];

  // Hierarquia do OFF, do geral pro específico. Prefere as tags `en:` (as únicas que a busca entende sempre).
  function hierarquia(p){
    const h = p && (Array.isArray(p.categories_hierarchy) && p.categories_hierarchy.length ? p.categories_hierarchy : p.categories_tags);
    const l = (Array.isArray(h) ? h : []).filter(t => typeof t === "string" && t.trim()).map(t => t.trim());
    const en = l.filter(t => t.startsWith("en:"));
    return en.length ? en : l;
  }
  const categoriaDe = p => { const l = hierarquia(p); return l.length ? l[l.length - 1] : null; };
  function categoriaPai(p, cat){
    const l = hierarquia(p), i = l.indexOf(cat == null ? categoriaDe(p) : cat);
    return i > 0 ? l[i - 1] : null;
  }

  // Mais escaneados primeiro (unique_scans_n) e só os vendidos no Brasil.
  function urlBusca(cat){
    if (typeof cat !== "string" || !cat.trim()) return null;
    return "https://world.openfoodfacts.org/api/v2/search?categories_tags=" + encodeURIComponent(cat.trim()).replace(/%3A/gi, ":") +
      "&countries_tags=en:brazil&page_size=40&sort_by=unique_scans_n&fields=" + CAMPOS.join(",");
  }

  // `analisar(produto)` devolve o resultado do motor (com `.veredito`); só "comprar" (Pode levar) entra.
  // Mantém a ordem de popularidade em que a lista chegou. Sem nome, o próprio código e repetidos ficam fora.
  function melhores(produtos, analisar, codigoAtual, n){
    const max = Number.isFinite(+n) && +n > 0 ? Math.floor(+n) : 3;
    const atual = so(codigoAtual), codigos = new Set(), nomes = new Set(), out = [];
    for (const p of Array.isArray(produtos) ? produtos : []){
      if (out.length >= max) break;
      if (!p || typeof p !== "object") continue;
      const code = so(p.code), nome = String(p.product_name_pt || p.product_name || "").trim();
      const marca = String(p.brands || "").split(",")[0].trim();
      if (!code || igual(code, atual) || !nome || [...codigos].some(c => igual(c, code))) continue;
      const chave = nrm(nome) + "|" + nrm(marca);
      if (nomes.has(chave)) continue;
      let r; try { r = analisar(p); } catch (e) { continue; }
      if (!r || r.veredito !== "comprar") continue;
      codigos.add(code); nomes.add(chave);
      out.push({ code, nome, marca, veredito: "comprar" });
    }
    return out;
  }

  return { CAMPOS, categoriaDe, categoriaPai, urlBusca, melhores };
})();
