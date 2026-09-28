# Roadmap técnico — de app pessoal a app de verdade

Base: pesquisa em `docs/PESQUISA-LEITURA-ROTULO-E-BASES.md` (preços com fonte, câmbio R$ 5,19) e auditoria do código em 2026-09-28.
Regra que vale pra tudo: **uma tela só, mínimo de texto** (ver `CLAUDE.md` → Produto).
`[Thiago]` = só você consegue fazer (conta, senha, segredo). O resto a gente entrega por PR na branch `app-de-verdade`.

## A decisão: os 2 caminhos, na ordem certa

**Decisão (2026-09-28): sem IA.** Quem lê o rótulo é o próprio aparelho; o servidor só organiza o texto por regras e guarda.

1. **Agora: API própria + base compartilhada, R$ 0.** Android lê com o ML Kit no aparelho; iPhone pelo site usa o Escanear Texto do iOS. O texto vai pra API, que organiza (ingredientes, alérgenos, lupa "ALTO EM") e guarda **por código de barras**: o que um usuário lê, todo mundo ganha. A foto nunca sai do celular.
2. **Depois: app nativo no iPhone** (quando der dinheiro). Dá pra gerar sem ter Mac (GitHub Actions tem Mac grátis em repo público), mas a Apple cobra US$ 99/ano (≈ R$ 514) pra publicar. Aí o iPhone lê o rótulo no aparelho (leitor de texto da Apple), de graça, igual o Android.

Se o passo a mais do iPhone pelo site pesar antes do app nativo: leitor de texto na nuvem sem IA (Google Cloud Vision: 1.000 fotos/mês grátis, depois ≈ R$ 7,78 por 1.000). O que se perde sem IA é a tabela nutricional por foto; o veredito vive de ingredientes e da lupa "ALTO EM", que regra pega.

## Fase 0 — Base segura (antes de ter mais gente usando)

- [ ] `[Thiago]` **Chave de assinatura de verdade.** Hoje o APK público é de *debug* e a chave (com senha `levaounao`) está no repositório, ou seja, qualquer pessoa consegue assinar um "APK atualizado" falso. Você gera uma chave nova, guarda a senha no seu gerenciador e coloca a chave em *Settings → Secrets* do GitHub (o passo a passo vem no PR). Obs.: quem já tem o app instalado vai precisar desinstalar uma vez.
- [x] CI gera o APK **release** assinado com essa chave (e o AAB pra Play Store). A chave de debug sai do repositório.
- [x] Testes do **motor de regras** (hoje `www/index.html` 450-550): passa pra `www/regras.js` e ganha testes com produtos reais (Nescau, Toddy, iogurte, suco…). O CI roda os testes em todo PR, então regra nova não quebra veredito antigo.
- [x] CI mais seguro: permissão mínima e *actions* travadas por versão exata (SHA).
- [x] Site: CSP (lista do que a página pode carregar), timeout na busca do Open Food Facts (hoje, se a rede trava, fica esperando pra sempre) e funcionar offline (abre mesmo sem sinal no mercado).
- **Pronto quando:** APK release assinado nas Releases, testes verdes no PR, site abre sem internet.

## Fase 1 — API + "1 toque → foto → resultado" (resolve o b.o. de hoje)

Onde roda: **Cloudflare Workers + D1** (banco SQLite deles). É grátis até 100 mil chamadas/dia e fica sempre ligado. O Supabase grátis "dorme" depois de 1 semana parado e demora pra acordar, por isso ficou de fora.

- [ ] `[Thiago]` Conta Cloudflare (grátis). Passo a passo em `api/README.md`.
- [x] `GET /v1/produto/{código}` — procura na base própria → Open Food Facts (o servidor manda o *User-Agent* que eles pedem) → responde `sem_cadastro`. Com cache, o 2º usuário recebe na hora.
- [x] `POST /v1/rotulo-texto` — o app manda o texto que o aparelho leu (ML Kit no Android, Escanear Texto no iPhone) e o servidor organiza por regras (`www/rotulo.js`), grava **por código de barras** e devolve o produto. A API nem recebe foto.
- [x] App: `API_URL` vazio = funciona como hoje, direto no Open Food Facts. Com a API, busca nela primeiro e manda o texto lido do rótulo.
- [x] Proteção contra abuso: Cloudflare Turnstile (captcha invisível, grátis), limite por IP e limite de tamanho do texto.
- [ ] `[Thiago]` Antes de ligar (precisa de celular e dos rótulos na mão): teste com **30 rótulos reais** (brilho, curva, letra miúda) passando pelo leitor do aparelho + organizador. Só vai pro ar se acertar os ingredientes em ≥ 28/30.
- **Pronto quando:** produto sem cadastro lido por uma pessoa sai na hora, sem ler de novo, pra qualquer outra que escanear o mesmo código.

## Fase 2 — A base brasileira que cresce sozinha

- [x] Proteção contra dado errado: cada leitura guarda a fonte (base aberta, texto lido do rótulo). Se uma leitura nova diverge da anterior, o produto é marcado pra revisão.
- [x] Devolver ao **Open Food Facts** os produtos que a gente leu. A base deles cresce, o Yuka e outros apps também ganham, e o nosso app vira fonte de dado brasileiro. Liga sozinho quando `OFF_USER`/`OFF_PASS` estiverem nos segredos do Worker.
- [x] Números que importam, sem guardar dado pessoal: % de códigos encontrados, tempo até o veredito, quantos produtos novos por dia.
- [ ] Domínio próprio (ex.: `levaounao.com.br`, ~R$ 40/ano) e o site passa do GitHub Pages pro Cloudflare Pages (cabeçalhos de segurança de verdade, tudo numa conta só).

## Fase 3 — Qualquer código de barras

- [x] Mesma API, mais bases grátis da mesma família do Open Food Facts: **Beauty** (cosméticos), **Pet Food** e **Products** (limpeza, geral).
- [x] Motor de regras **por categoria** (alimento, cosmético, pet, limpeza), cada uma com um mini ícone. O usuário não escolhe nada: o código de barras diz a categoria.
- [x] Remédio: só informação (nome, princípio ativo, preço máximo da CMED/Anvisa), **nunca** "leva ou não". Veredito sobre remédio é assunto de saúde e pode dar problema legal.
- [ ] Bases pagas brasileiras (Bluesoft Cosmos a partir de ~R$ 500/mês, GS1 Brasil com filiação) só quando o app pagar isso.

## Fase 4 — Lojas

- [ ] `[Thiago]` Google Play: US$ 25 uma vez só (≈ R$ 130). Publica o AAB assinado da Fase 0. O checklist e a política de privacidade já estão em `docs/`.
- [ ] `[Thiago]` App Store: US$ 99/ano (≈ R$ 514), só quando houver receita. O CI gera o app de iPhone num Mac do GitHub, e aí o iPhone lê o rótulo no aparelho, de graça.

## O que já está bom (não mexer)

- Nenhum dado do Open Food Facts nem do OCR vai pra tela como HTML, então não há brecha de injeção de código.
- Leitor de código de barras em WebAssembly lendo a faixa central: rápido e já testado no mercado.
- Publicação automática (site + APK) a cada push na main.
