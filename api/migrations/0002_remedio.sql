-- Remédio (ROADMAP-TECNICO, Fase 3): só informação, nunca veredito.
-- Fonte: lista de preços da CMED/Anvisa (PMC), carregada por scripts/importa-cmed.mjs (a lista muda todo mês).
-- Uma linha por EAN: produto com EAN 1/2/3 na CMED vira até 3 linhas iguais com chaves diferentes.
CREATE TABLE IF NOT EXISTS remedio (
  ean              TEXT PRIMARY KEY,   -- chave de normalizaEan() em src/remedio.js (13 dígitos, DV válido)
  nome             TEXT NOT NULL,      -- PRODUTO (nome comercial)
  principio_ativo  TEXT,               -- SUBSTÂNCIA ("A + B" quando associação)
  apresentacao     TEXT,               -- APRESENTAÇÃO (dose, forma, embalagem)
  laboratorio      TEXT,               -- LABORATÓRIO (detentor do registro)
  pmc              REAL,               -- R$ na alíquota padrão (pmc_icms); NULL = sem PMC (ex.: uso hospitalar)
  pmc_icms         TEXT,               -- alíquota do pmc acima: "18%" (padrão) ou "0%" (isento de ICMS)
  pmc_por_aliquota TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(pmc_por_aliquota)), -- {"0%":..,"18%":..,"18% ALC":..,"sem impostos":..}
  referencia       TEXT NOT NULL,      -- mês da lista CMED, "AAAA-MM"
  atualizado_em    TEXT NOT NULL       -- ISO 8601 da importação (o import apaga o que não veio na lista nova)
);
