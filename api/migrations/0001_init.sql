-- Leva ou não? — esquema inicial (Cloudflare D1 / SQLite).
-- Nada pessoal: sem IP, sem usuário, sem foto. Só produto, texto lido do rótulo e contagem agregada.
-- Datas em epoch ms (Date.now()).

CREATE TABLE IF NOT EXISTS produto (
  ean            TEXT PRIMARY KEY,                 -- GTIN de 8 a 14 dígitos (dígito verificador conferido na API)
  dados          TEXT NOT NULL,                    -- JSON no formato do Open Food Facts v2 (+ _lido, _rotulo quando veio do rótulo)
  categoria      TEXT NOT NULL DEFAULT 'alimento'
                 CHECK (categoria IN ('alimento', 'cosmetico', 'pet', 'limpeza', 'remedio')),
  fonte          TEXT NOT NULL
                 CHECK (fonte IN ('base', 'off', 'obf', 'opff', 'opf', 'cmed')),
  atualizado_em  INTEGER NOT NULL,                 -- o que veio de fora é buscado de novo depois de 30 dias
  revisao        INTEGER NOT NULL DEFAULT 0 CHECK (revisao IN (0, 1)), -- 1 = leituras do rótulo divergem; alguém confere
  enviado_off_em INTEGER                           -- quando foi devolvido ao Open Food Facts (NULL = ainda não)
);
CREATE INDEX IF NOT EXISTS produto_envio ON produto (revisao, enviado_off_em);

-- cada leitura do rótulo guarda de onde veio o texto
CREATE TABLE IF NOT EXISTS leitura (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  ean          TEXT NOT NULL,
  fonte        TEXT NOT NULL CHECK (fonte IN ('mlkit', 'ios', 'digitado')),
  texto        TEXT NOT NULL,                      -- como veio do aparelho (até 8 KB)
  ingredientes TEXT,                               -- o que as regras tiraram (NULL = não achou a lista)
  criado_em    INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS leitura_ean ON leitura (ean, criado_em);

-- só agregado por dia (horário de Brasília): quantas buscas, quantas acharam, soma do tempo
CREATE TABLE IF NOT EXISTS metrica_dia (
  dia     TEXT NOT NULL,                           -- AAAA-MM-DD
  evento  TEXT NOT NULL,
  achou   INTEGER NOT NULL CHECK (achou IN (0, 1)),
  n       INTEGER NOT NULL DEFAULT 0,
  soma_ms INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (dia, evento, achou)
);
