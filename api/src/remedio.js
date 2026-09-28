// Remédio (ROADMAP-TECNICO, Fase 3): SÓ informação — nome, princípio ativo, apresentação, laboratório e
// preço máximo ao consumidor (PMC) da lista CMED/Anvisa. NUNCA veredito "leva ou não": remédio é assunto de
// saúde e pode dar problema legal. O resultado daqui não passa pelo motor de regras.
// Dados: tabela `remedio` (migrations/0002_remedio.sql), carregada por scripts/importa-cmed.mjs.

// Chave única do EAN, usada no import e na busca: só dígitos, dígito verificador GTIN válido, e forma de
// 13 dígitos (UPC-A de 12, EAN-8 e GTIN-14 com zero à esquerda caem na mesma chave). Inválido => null.
export function normalizaEan(bruto) {
  const d = String(bruto ?? "").replace(/\D/g, "");
  if (d.length < 8 || d.length > 14 || /^0+$/.test(d)) return null;
  let soma = 0;
  for (let i = d.length - 2, peso = 3; i >= 0; i--, peso = 4 - peso) soma += Number(d[i]) * peso;
  if ((10 - (soma % 10)) % 10 !== Number(d[d.length - 1])) return null;
  const g14 = d.padStart(14, "0");
  return g14[0] === "0" ? g14.slice(1) : g14;
}

export async function buscaRemedio(env, ean) {
  const chave = normalizaEan(ean);
  if (!chave || !env?.DB) return null;
  let linha;
  try {
    linha = await env.DB.prepare(
      "SELECT nome, principio_ativo, apresentacao, laboratorio, pmc, pmc_icms, referencia FROM remedio WHERE ean = ?1",
    )
      .bind(chave)
      .first();
  } catch (e) {
    // Tabela ainda não migrada/carregada não pode derrubar a busca do produto: segue como "sem cadastro".
    console.error("remedio: falha no D1", e?.message ?? e);
    return null;
  }
  if (!linha) return null;
  return {
    code: String(ean).replace(/\D/g, ""),
    product_name: linha.nome,
    principio_ativo: linha.principio_ativo,
    apresentacao: linha.apresentacao,
    laboratorio: linha.laboratorio,
    pmc: typeof linha.pmc === "number" ? linha.pmc : null,
    pmc_icms: linha.pmc_icms,
    _referencia: linha.referencia,
    _categoria: "remedio",
    _fonte: "cmed",
  };
}
