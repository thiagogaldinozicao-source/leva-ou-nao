# API do Leva ou não?

Cloudflare Workers + D1 (banco SQLite deles), plano grátis. Sem IA: o texto do rótulo vem do celular
(ML Kit no Android, Escanear Texto no iPhone, ou digitado) e a API organiza por regras (`www/rotulo.js`,
o mesmo arquivo que o app usa). Nenhuma foto chega aqui. Nenhum dado pessoal é gravado (nem IP).

| Rota | O que faz |
|---|---|
| `GET /v1/produto/{código}` | base própria → Open Food Facts → Beauty/Pet/Products Facts → remédio → `sem_cadastro` |
| `POST /v1/rotulo-texto` | `{ean, texto, fonte: "mlkit"\|"ios"\|"digitado", turnstile?}` → produto com os ingredientes |
| `POST /v1/metrica` | `{evento: "busca", achou, ms}` → soma no dia (só o total) |
| cron (4x/dia) | devolve ao Open Food Facts os ingredientes lidos do rótulo (só com `OFF_USER`/`OFF_PASS`) |

## Passo a passo (Thiago, uma vez só)

1. Crie uma conta grátis em <https://dash.cloudflare.com/sign-up>.
2. No terminal, dentro desta pasta: `cd api && npm install`
3. `npx wrangler login` (abre o navegador; autorize).
4. `npx wrangler d1 create leva-ou-nao` → copie o `database_id` que aparecer e cole no lugar de
   `PREENCHER` em `api/wrangler.toml`.
5. `npm run migrar` (cria as tabelas no banco).
6. Opcional — segredos (ficam só no Cloudflare, nunca no repositório):
   - `npx wrangler secret put TURNSTILE_SECRET` → captcha invisível contra robô (crie o widget em
     Cloudflare → Turnstile; a chave *site key* vai no app). **Ainda não ligue:** o app ainda não manda
     o token, então com esse segredo todo envio de rótulo volta 403 (o app segue só com a leitura local).
   - `npx wrangler secret put OFF_USER` e `npx wrangler secret put OFF_PASS` → conta do app no
     <https://world.openfoodfacts.org> (crie uma conta só pro app). Sem elas, nada é enviado.
7. `npm run deploy` → aparece a URL, tipo `https://leva-ou-nao-api.SEU-USUARIO.workers.dev`.
8. No app (`www/index.html`): cole essa URL em `API_URL` e também no `connect-src` da CSP.

Testar no computador: `npm run migrar:local && npm run dev` (segredos locais em `api/.dev.vars`, que o git ignora).

## Dia a dia

- **Produtos em revisão** (duas leituras do rótulo que não batem; não vão pro Open Food Facts):
  `npx wrangler d1 execute leva-ou-nao --remote --command "SELECT ean, json_extract(dados,'$.ingredients_text_pt') FROM produto WHERE revisao = 1"`
  Conferiu? `... --command "UPDATE produto SET revisao = 0 WHERE ean = 'CODIGO'"`
- **Números**: `... --command "SELECT * FROM metrica_dia ORDER BY dia DESC LIMIT 14"` (tempo médio = `soma_ms / n`).
- O cache de borda (Cache API) só vale com domínio próprio; no `workers.dev` quem segura é o D1, que já é rápido.
- Dado do Open Food Facts é ODbL: o app mostra a fonte, e o que misturamos com ele herda a licença.
