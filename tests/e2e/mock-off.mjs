// Open Food Facts (e irmãs) MOCKADO por interceptação de rede no contexto do Playwright: nenhum teste sai pra
// internet. Produtos = tests/fixtures/*.json (reais); busca e taxonomia do "Tem melhor?" = as URLs que o
// www/troca.js monta (urlBusca / urlTaxonomia). Mudou o formato da URL lá? Ajuste os regex aqui.
import { readFileSync, readdirSync } from "node:fs";

const FX = new URL("../fixtures/", import.meta.url);
export const fx = Object.fromEntries(readdirSync(FX).filter(f => f.endsWith(".json"))
  .map(f => [f.replace(/\.json$/, ""), JSON.parse(readFileSync(new URL(f, FX), "utf8"))]));

// Categorias no formato do OFF (as fixtures do motor não trazem: o motor não lê categoria, o "Tem melhor?" lê).
const CAT_ACHOCOLATADO = ["en:beverages", "en:instant-beverages", "en:cocoa-and-chocolate-powders", "en:sweetened-beverages"];
export const TAXONOMIA = {
  "en:beverages": { parents: [] },
  "en:instant-beverages": { parents: ["en:beverages"] },
  "en:cocoa-and-chocolate-powders": { parents: ["en:instant-beverages"] },
  "en:sweetened-beverages": { parents: ["en:beverages"] },
};
// Um 4º "Pode levar" na lista prova o teto de 3; o Toddy (Deixa na prateleira) prova o filtro do motor.
const CACAU = { code: "7890000000017", product_name_pt: "Cacau em pó 100%", brands: "Cacau Bom", ingredients_text_pt: "Cacau em pó",
  additives_tags: [], nova_group: 1, nutriments: { sugars_100g: 1, salt_100g: 0.02, "saturated-fat_100g": 1 } };
export const produtos = {
  ...Object.fromEntries(Object.values(fx).map(p => [p.code, p])),
  [fx.nescau.code]: { ...fx.nescau, categories_tags: CAT_ACHOCOLATADO },
  [CACAU.code]: CACAU,
};
// Ordem de "mais escaneados": Nescau (o próprio, sai), Toddy (evitar, sai), iogurte, água, papinha, cacau.
export const BUSCA = [fx.nescau, fx.toddy, fx["iogurte-natural"], fx.agua, fx.papinha, CACAU];

const CORS = { "access-control-allow-origin": "*", "content-type": "application/json" };
const RE_OFF = /^https:\/\/world\.open(food|beauty|petfood|products)facts\.org\//;

// opcoes.busca503 = quantas buscas iniciais respondem 503 SEM CORS (como o OFF sobrecarregado faz).
// Devolve o contador de chamadas, pra o teste provar retentativa.
export async function mockOff(ctx, { busca503 = 0 } = {}) {
  const n = { produto: 0, busca: 0, taxonomia: 0, outras: [] };
  await ctx.route(RE_OFF, route => {
    const u = new URL(route.request().url());
    const off = u.hostname === "world.openfoodfacts.org";
    const m = u.pathname.match(/^\/api\/v2\/product\/(\d+)\.json$/);
    if (m) {
      n.produto++;
      const p = off && produtos[m[1]];
      return route.fulfill(p ? { status: 200, headers: CORS, body: JSON.stringify({ status: 1, code: m[1], product: p }) }
        : { status: 404, headers: CORS, body: JSON.stringify({ status: 0, status_verbose: "product not found" }) });
    }
    if (off && u.pathname === "/api/v2/search") {
      n.busca++;
      if (n.busca <= busca503) return route.fulfill({ status: 503, headers: { "content-type": "text/html" }, body: "<h1>503</h1>" });
      const cat = u.searchParams.get("categories_tags");
      const lista = cat === "en:cocoa-and-chocolate-powders" ? BUSCA : [];
      return route.fulfill({ status: 200, headers: CORS, body: JSON.stringify({ count: lista.length, products: lista }) });
    }
    if (off && u.pathname === "/api/v2/taxonomy") {
      n.taxonomia++;
      const tags = (u.searchParams.get("tags") || "").split(",").filter(t => TAXONOMIA[t]);
      return route.fulfill({ status: 200, headers: CORS, body: JSON.stringify(Object.fromEntries(tags.map(t => [t, TAXONOMIA[t]]))) });
    }
    n.outras.push(u.href);
    return route.fulfill({ status: 404, headers: CORS, body: "{}" });
  });
  return n;
}
