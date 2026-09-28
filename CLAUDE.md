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
- `www/index.html` — o app inteiro (HTML + CSS + JS num arquivo só). `www/lib/` = ZXing wasm (não editar).
  Faixas (em 2026-09-28; mudou? `grep -n` antes): CSS 16-133 · HTML 135-197 · JS 198-678:
  busca OFF 209-227 · baseLocal 229-236 · renderSlot 238-270 · OCR/rótulo 272-341 · scanner ZXing 348-435 ·
  **motor de regras 450-550** · analisarProduto 552-587 · tela resultado 589-651 · histórico 653-665.
- `android/` — Capacitor 8 (id `br.com.zicao.levaounao`). `capacitor.config.json`.
- `.github/workflows/site.yml` — `www/` → GitHub Pages a cada push na main.
- `.github/workflows/android.yml` — APK → Releases quando muda `www/`, `android/` ou deps.
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
