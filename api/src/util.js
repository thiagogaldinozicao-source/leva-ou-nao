// Funções puras da API (sem env, sem rede): dá pra testar com node direto.

/** GTIN de 8 a 14 dígitos com dígito verificador certo (mesma conta de EAN-8/UPC/EAN-13/GTIN-14). */
export function eanValido(ean) {
  if (typeof ean !== "string" || !/^\d{8,14}$/.test(ean)) return false;
  let soma = 0;
  for (let i = ean.length - 2, peso = 3; i >= 0; i--, peso = 4 - peso) soma += Number(ean[i]) * peso;
  return (10 - (soma % 10)) % 10 === Number(ean[ean.length - 1]);
}

/** Ingredientes pra comparar leituras: minúsculo, sem acento, só letras/números. */
export function normalizaIngredientes(s) {
  return String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

/** Duas leituras do mesmo rótulo nunca batem letra por letra (OCR erra uma ou outra palavra).
    Mesma leitura = mesmas palavras em >= 85% (Jaccard). Abaixo disso o produto vai pra revisão. */
export function parecidos(a, b) {
  const x = normalizaIngredientes(a), y = normalizaIngredientes(b);
  if (x === y) return true;
  const A = new Set(x.split(" ").filter(Boolean)), B = new Set(y.split(" ").filter(Boolean));
  let comum = 0;
  for (const w of A) if (B.has(w)) comum++;
  const uniao = A.size + B.size - comum;
  return uniao > 0 && comum / uniao >= 0.85;
}

export const semIngredientes = d => !d || !(d.ingredients_text_pt || d.ingredients_text);

export const bytes = s => new TextEncoder().encode(String(s)).length;

/** Dia no horário de Brasília (sem horário de verão desde 2019). */
export const diaBrasilia = (agora = Date.now()) => new Date(agora - 3 * 3600 * 1000).toISOString().slice(0, 10);
