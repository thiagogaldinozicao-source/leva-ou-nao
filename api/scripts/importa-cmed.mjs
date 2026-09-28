#!/usr/bin/env node
// Importa a lista de preços de medicamentos da CMED/Anvisa pra tabela `remedio` do D1 (Fase 3: remédio é
// SÓ informação — nome, princípio ativo, preço máximo —, nunca veredito).
//
// A LISTA MUDA TODO MÊS (e às vezes 2x no mês): reimportar a cada publicação.
// De onde baixar: https://www.gov.br/anvisa/pt-br/assuntos/medicamentos/cmed/precos
//   => link "PMC - xls" (Preço Máximo ao Consumidor; o "PMVG" é preço pra governo, NÃO serve aqui).
//   Em 2026-09: .../cmed/precos/arquivos/xls_conformidade_site_20260909_222937320.xlsx/@@download/file
//
// Como rodar (de dentro de api/, com a dependência "xlsx" instalada):
//   node scripts/importa-cmed.mjs ~/Downloads/xls_conformidade_site_AAAAMMDD_*.xlsx
//   npx wrangler d1 execute DB --remote --file <o .sql que o script imprimir>
// Opções: --saida arq.sql | --referencia AAAA-MM (se não achar "Publicada em dd/mm/aaaa") | --sem-limpeza
// Sem --sem-limpeza, o .sql termina apagando os EANs que saíram da lista (preço antigo não fica no ar).
// O .sql fica fora do repo por padrão (pasta temporária): ~20 MB, gerado, não versionar.
//
// Layout real (2026-09): ~40 linhas de texto explicativo ANTES do cabeçalho; cabeçalho = linha com
// SUBSTÂNCIA | CNPJ | LABORATÓRIO | CÓDIGO GGREM | REGISTRO | EAN 1 | EAN 2 | EAN 3 | PRODUTO | APRESENTAÇÃO |
// ... | PF <alíquota> ... | PMC Sem Impostos | PMC 0 % | PMC 12 % | PMC 12 %  ALC | ... | PMC 23 %  ALC |
// RESTRIÇÃO HOSPITALAR | ... | ICMS 0% | ... | COMERCIALIZAÇÃO <ano> | TARJA. Colunas achadas pelo NOME
// (não pela posição). Preço vem como texto "46,84"; EAN vazio vem como "    -     ".
import { readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as XLSX from "xlsx";
import { normalizaEan } from "../src/remedio.js";

// Alíquota padrão do `pmc`: 18% = ICMS de SP e MG (maiores mercados de farmácia, ~1/3 da população) e meio
// da faixa 17–23% dos estados; isento (coluna "ICMS 0%" = Sim) usa 0%. As outras ficam em pmc_por_aliquota.
const ALIQUOTA_PADRAO = "18%";
const MAX_BYTES_POR_INSERT = 90_000; // D1: comando SQL até 100 KB
const MAX_LINHAS_POR_INSERT = 200;
const MINIMO_ESPERADO = 5_000; // 2026-09 tem ~27 mil EANs; menos que isso = layout mudou, não apaga a tabela

const args = process.argv.slice(2);
const opcao = (nome) => {
  const i = args.indexOf(nome);
  return i >= 0 ? args.splice(i, 2)[1] : undefined;
};
const semLimpeza = args.includes("--sem-limpeza") && args.splice(args.indexOf("--sem-limpeza"), 1);
let saida = opcao("--saida");
let referencia = opcao("--referencia");
const planilha = args[0];
if (!planilha) {
  console.error("uso: node scripts/importa-cmed.mjs <planilha PMC .xlsx|.xls> [--saida arq.sql] [--referencia AAAA-MM] [--sem-limpeza]");
  process.exit(2);
}

const chaveCab = (v) =>
  String(v ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/\s+/g, " ").trim();
const texto = (v) => {
  const s = String(v ?? "").replace(/\s+/g, " ").trim();
  return s === "" || /^-+$/.test(s) ? null : s;
};
// "1.234,56" | "46,84" | 46.84 => número; vazio/traço => null
const numero = (v) => {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const s = texto(v);
  if (!s) return null;
  const n = Number(s.includes(",") ? s.replace(/\./g, "").replace(",", ".") : s);
  return Number.isFinite(n) ? n : null;
};

const wb = XLSX.read(readFileSync(planilha), { type: "buffer", dense: true, cellStyles: false, cellHTML: false });
const linhas = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: true, defval: null, blankrows: false });

const iCab = linhas.findIndex((l) => l.some((c) => chaveCab(c) === "SUBSTANCIA") && l.some((c) => chaveCab(c) === "EAN 1"));
if (iCab < 0) throw new Error("cabeçalho (SUBSTÂNCIA ... EAN 1) não encontrado: o layout da CMED mudou?");
if (!referencia) {
  for (const l of linhas.slice(0, iCab)) {
    const m = l.map(texto).join(" ").match(/Publicada em (\d{2})\/(\d{2})\/(\d{4})/i);
    if (m) { referencia = `${m[3]}-${m[2]}`; break; }
  }
}
if (!/^\d{4}-\d{2}$/.test(referencia ?? "")) throw new Error('mês da lista não achado: passe --referencia AAAA-MM');

const cab = linhas[iCab].map(chaveCab);
const col = (nome, obrigatoria = true) => {
  const i = cab.findIndex((c) => (nome instanceof RegExp ? nome.test(c) : c === nome));
  if (i < 0 && obrigatoria) throw new Error(`coluna "${nome}" não encontrada: o layout da CMED mudou?`);
  return i;
};
const C = {
  substancia: col("SUBSTANCIA"),
  laboratorio: col("LABORATORIO"),
  eans: [col("EAN 1"), col("EAN 2"), col("EAN 3")],
  produto: col("PRODUTO"),
  apresentacao: col("APRESENTACAO"),
  icms0: col("ICMS 0%", false),
  hospitalar: col("RESTRICAO HOSPITALAR", false),
  comercializado: col(/^COMERCIALIZACAO/, false),
};
// "PMC 12 % ALC" => "12% ALC"; "PMC SEM IMPOSTOS" => "sem impostos"
const pmcCols = cab
  .map((c, i) => [c.match(/^PMC (.+)$/)?.[1], i])
  .filter(([r]) => r)
  .map(([r, i]) => [/SEM IMPOSTOS/.test(r) ? "sem impostos" : r.replace(/\s*%/, "%").replace(/\s+/g, " ").trim(), i]);
if (!pmcCols.some(([k]) => k === ALIQUOTA_PADRAO)) throw new Error(`coluna "PMC ${ALIQUOTA_PADRAO}" não encontrada`);

const sim = (i, l) => i >= 0 && chaveCab(l[i]) === "SIM";
const porEan = new Map();
let conflitos = 0, eansInvalidos = 0;
for (const l of linhas.slice(iCab + 1)) {
  const nome = texto(l[C.produto]);
  if (!nome) continue;
  const aliquotas = {};
  for (const [k, i] of pmcCols) {
    const v = numero(l[i]);
    if (v != null && v > 0) aliquotas[k] = v;
  }
  const isento = sim(C.icms0, l) && aliquotas["0%"] != null;
  const pmc = isento ? aliquotas["0%"] : aliquotas[ALIQUOTA_PADRAO] ?? null;
  const reg = {
    nome,
    principio_ativo: texto(l[C.substancia])?.split(";").map((s) => s.trim()).filter(Boolean).join(" + ") ?? null,
    apresentacao: texto(l[C.apresentacao]),
    laboratorio: texto(l[C.laboratorio]),
    pmc,
    pmc_icms: pmc == null ? null : isento ? "0%" : ALIQUOTA_PADRAO,
    pmc_por_aliquota: JSON.stringify(aliquotas),
  };
  // Mesmo EAN em 2 linhas (erro de cadastro na CMED): fica a comercializada, com PMC, fora de hospital.
  const nota = (sim(C.comercializado, l) ? 4 : 0) + (pmc != null ? 2 : 0) + (sim(C.hospitalar, l) ? 0 : 1);
  for (const i of C.eans) {
    const bruto = texto(l[i]);
    if (!bruto) continue;
    const ean = normalizaEan(bruto);
    if (!ean) { eansInvalidos++; continue; }
    const atual = porEan.get(ean);
    if (atual) {
      conflitos++;
      if (atual.nota >= nota) continue;
    }
    porEan.set(ean, { ...reg, ean, nota });
  }
}
if (porEan.size < MINIMO_ESPERADO) {
  throw new Error(`só ${porEan.size} EANs (esperado > ${MINIMO_ESPERADO}): layout mudou? nada foi gerado`);
}

const sql = (v) =>
  v == null ? "NULL" : typeof v === "number" ? String(v) : `'${String(v).replace(/'/g, "''")}'`;
const atualizadoEm = new Date().toISOString();
const COLS = ["ean", "nome", "principio_ativo", "apresentacao", "laboratorio", "pmc", "pmc_icms", "pmc_por_aliquota", "referencia", "atualizado_em"];
const cabecalhoInsert = `INSERT INTO remedio (${COLS.join(", ")}) VALUES\n`;
const upsert =
  `\nON CONFLICT(ean) DO UPDATE SET ` +
  COLS.slice(1).map((c) => `${c} = excluded.${c}`).join(", ") +
  ";\n";

// Sem BEGIN/COMMIT: o import do D1 não aceita transação no arquivo.
const partes = [`-- CMED ${referencia}: ${porEan.size} EANs, gerado ${atualizadoEm} por scripts/importa-cmed.mjs\n`];
let lote = [], bytes = 0;
const fecha = () => {
  if (lote.length) partes.push(cabecalhoInsert + lote.join(",\n") + upsert);
  lote = [];
  bytes = 0;
};
for (const r of porEan.values()) {
  const tupla = `(${[r.ean, r.nome, r.principio_ativo, r.apresentacao, r.laboratorio, r.pmc, r.pmc_icms, r.pmc_por_aliquota, referencia, atualizadoEm].map(sql).join(", ")})`;
  const tb = Buffer.byteLength(tupla) + 2;
  if (lote.length >= MAX_LINHAS_POR_INSERT || bytes + tb > MAX_BYTES_POR_INSERT - 1_000) fecha();
  lote.push(tupla);
  bytes += tb;
}
fecha();
if (!semLimpeza) partes.push(`DELETE FROM remedio WHERE atualizado_em <> ${sql(atualizadoEm)};\n`);

saida ??= join(tmpdir(), `cmed-remedio-${referencia}.sql`);
writeFileSync(saida, partes.join(""));
console.error(
  `CMED ${referencia}: ${porEan.size} EANs | ${conflitos} EAN repetido entre linhas | ${eansInvalidos} EAN inválido ignorado\n` +
    `=> npx wrangler d1 execute DB --remote --file ${saida}`,
);
