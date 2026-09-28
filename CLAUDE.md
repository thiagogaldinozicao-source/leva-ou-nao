# CLAUDE.md — Leva ou não?

Carregado toda sessão. Curto e só o que decide. Detalhe mora em `ROADMAP.md` e `docs/`.

## O que é
Escaneia o código de barras no mercado e diz **Pode levar / Com moderação / Deixa na prateleira**.
Fluxo: código de barras (ZXing wasm | leitor nativo Android) → Open Food Facts → regras próprias (NOVA, açúcar adicionado, adoçante, corante, conservante…) → veredito.
Produto sem cadastro → ler ingredientes do rótulo (Android: ML Kit no aparelho; site no iPhone: Escanear Texto do iOS) → `baseLocal` (hoje só no aparelho).

## Git (vale acima de qualquer regra global)
- `main` é do Thiago e **publica sozinha** (push na main = site no ar + APK novo). ! push na main.
- Nosso trabalho: branch `app-de-verdade` (ou branch por tarefa saindo dela) → PR pra main. Commit + push da BRANCH sem perguntar.
- Antes de criar branch: `git fetch origin`. Commit em pt-BR, curto, dizendo o porquê.

## Token diet
- Localiza antes de ler: `grep -n` / `rg -n` → Read só a FAIXA (offset/limit). ! Read do `www/index.html` inteiro.
- `.ignore` já tira da busca binário, minificado e gerado (`www/lib/`, fontes, ícones, `res/` do Android).
- Resposta = resultado. Sem preâmbulo, sem recapitular o diff.

## Mapa
- `www/index.html` — casca do app (HTML + CSS + JS de tela; motor e regras foram pra arquivos próprios). `www/lib/` = ZXing wasm (não editar).
  Faixas (em 2026-09-28; mudou? `grep -n '/\* ----------'` antes): CSS 21-139 · HTML 141-205 · JS 206-653:
  busca própria/bases abertas 217-283 · baseLocal + renderSlot 286-327 · OCR/rótulo (painel + ML Kit/iOS) 329-427 ·
  scanner ZXing/BarcodeDetector 429-529 · tela de resultado (usa `Regras`/`Categorias`) 531-624 · histórico 625-651.
- `www/regras.js` — motor de regras de ALIMENTO (NOVA, açúcar, adoçante, corante, conservante) → `globalThis.Regras`.
- `www/categorias.js` — veredito de cosmético/pet/limpeza e informação (sem veredito) de remédio → `globalThis.Categorias`.
- `www/troca.js` — "🔁 Tem melhor?": categoria do produto (OFF) → URL da busca no OFF (Brasil, mais escaneados) → até 3 trocas com "Pode levar" → `globalThis.Troca`; puro, o fetch e o botão ficam no `index.html` (`trocaBox`).
- `www/rotulo.js` — parser por regras do texto lido no rótulo (ingredientes, alérgenos, "ALTO EM") → `globalThis.Rotulo`; mesmo arquivo usado pela API (`api/src/index.js`).
- `www/sw.js` — service worker do site: cache-first em `lib/fonts/icons`, rede-primeiro no shell; nunca intercepta Open Food Facts/irmãs nem a API.
- `www/offline.js` — registra o `sw.js` (só no site, não no app empacotado).
- `www/_headers` — headers pra host que aplica o arquivo (Cloudflare Pages/Netlify); o GitHub Pages IGNORA: lá só vale a CSP da `<meta>` do `index.html`.
- `tests/` — `node --test` puro: `regras.test.mjs` roda `www/regras.js` como script clássico via `vm`; `categorias.test.mjs` idem pra `www/categorias.js`; `fixtures/` = produtos reais (JSON) pros casos.
- `scripts/vm-run.sh` (+ `vm-run.conf`) — TESTE NUNCA LOCAL: roda na VM tibiatest. `vm-run.sh test|check|api|e2e|android|quick` (segundos, exceto android ~3 min). `api` = `api/scripts/fumaca-local.mjs` (wrangler dev local + as 3 rotas).
- `tests/e2e/` — gate de navegador (`vm-run.sh e2e`, ~20 s): Chromium headless (playwright-core, `package.json` próprio) clica os fluxos com OFF mockado (`mock-off.mjs`) + axe + Lighthouse com piso (`lighthouse.test.mjs`) + instalável/SW; relatório e prints em `.vm-run/e2e/` do espelho.
- `android/` — Capacitor 8 (id `br.com.zicao.levaounao`). `capacitor.config.json`.
- `.github/workflows/site.yml` — `www/` → GitHub Pages a cada push na main.
- `.github/workflows/android.yml` — APK → Releases quando muda `www/`, `android/` ou deps.
- `api/` — Cloudflare Worker + D1, sem IA (`api/README.md` tem o passo a passo). `src/index.js` = rotas (`GET /v1/produto/{ean}`, `POST /v1/rotulo-texto`, `POST /v1/metrica`, cron que devolve ao Open Food Facts); `src/util.js` = funções puras (EAN, comparação de ingredientes); `src/remedio.js` = busca na tabela CMED (D1); `migrations/` = schema D1; `scripts/importa-cmed.mjs` = carrega a lista de preços CMED/Anvisa no D1.
- `docs/` — checklist de lançamento, privacidade, termos, pesquisas.

## Produto (decide toda mudança de tela)
- Uma tela só (single page): escaneia → veredito. Máximo de valor com o mínimo de tela e de texto, pra qualquer pessoa usar sem aprender.
- Ícone pequeno no lugar de texto; poucos menus; configuração escondida num lugar só.
- Feature nova que pede tela, aba ou parágrafo novo => cabe num ícone, num toque ou num padrão sensato? não => fica de fora.
- Produto sem cadastro = 1 toque → foto (descartável) → resultado. Sem passo extra pro usuário.

## Invariantes (não quebrar)
- Nenhuma foto é salva: a foto do rótulo é lida e descartada.
- Chave de API (IA, OCR, banco) **nunca** no app nem no repo: só no servidor, em segredo do provedor.
- Dado do Open Food Facts é ODbL: dar crédito, e o que for misturado com a base própria herda a licença.
