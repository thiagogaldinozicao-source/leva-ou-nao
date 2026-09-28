# Roadmap técnico — de app pessoal a app de verdade

Base: pesquisa em `docs/PESQUISA-LEITURA-ROTULO-E-BASES.md` (preços com fonte, câmbio R$ 5,19) e auditoria do código em 2026-09-28.
Regra que vale pra tudo: **uma tela só, mínimo de texto** (ver `CLAUDE.md` → Produto).
`[Thiago]` = só você consegue fazer (conta, senha, segredo). O resto a gente entrega por PR na branch `app-de-verdade`.

## A decisão: os 2 caminhos, na ordem certa

Os dois caminhos são bons. Faz o **2 agora** e o **1 depois**:

1. **Agora: API própria + IA barata só quando falta o produto + guarda o resultado.** Resolve o iPhone já, pelo site, sem Mac e sem App Store. Cada produto é pago **uma vez só, pra todo mundo** (o resultado fica na base compartilhada).
   Custo com Gemini Flash-Lite: 100 produtos novos/mês ≈ R$ 0,17 · 1.000 ≈ R$ 1,68 · 10.000 ≈ R$ 16,80. O custo nunca vai ser o problema.
2. **Depois: app nativo no iPhone** (quando der dinheiro). Dá pra gerar sem ter Mac (GitHub Actions tem Mac grátis em repo público), mas a Apple cobra US$ 99/ano (≈ R$ 514) pra publicar. Aí o iPhone passa a ler o rótulo no próprio aparelho, de graça, igual o Android já faz.

A API serve aos dois: o Android lê no aparelho e **manda o texto pra base compartilhada**, então o que um usuário lê, todo mundo ganha.

Aprendizado corrigido: o iPhone **deixa** a página mandar a foto. O que não pode é a chave da IA ficar dentro do app. Com a API no meio, a chave fica guardada no servidor e o problema some.

## Fase 0 — Base segura (antes de ter mais gente usando)

- [ ] `[Thiago]` **Chave de assinatura de verdade.** Hoje o APK público é de *debug* e a chave (com senha `levaounao`) está no repositório, ou seja, qualquer pessoa consegue assinar um "APK atualizado" falso. Você gera uma chave nova, guarda a senha no seu gerenciador e coloca a chave em *Settings → Secrets* do GitHub (o passo a passo vem no PR). Obs.: quem já tem o app instalado vai precisar desinstalar uma vez.
- [ ] CI gera o APK **release** assinado com essa chave (e o AAB pra Play Store). A chave de debug sai do repositório.
- [ ] Testes do **motor de regras** (hoje `www/index.html` 450-550): passa pra `www/regras.js` e ganha testes com produtos reais (Nescau, Toddy, iogurte, suco…). O CI roda os testes em todo PR, então regra nova não quebra veredito antigo.
- [ ] CI mais seguro: permissão mínima e *actions* travadas por versão exata (SHA).
- [ ] Site: CSP (lista do que a página pode carregar), timeout na busca do Open Food Facts (hoje, se a rede trava, fica esperando pra sempre) e funcionar offline (abre mesmo sem sinal no mercado).
- **Pronto quando:** APK release assinado nas Releases, testes verdes no PR, site abre sem internet.

## Fase 1 — API + "1 toque → foto → resultado" (resolve o b.o. de hoje)

Onde roda: **Cloudflare Workers + D1** (banco SQLite deles). É grátis até 100 mil chamadas/dia e fica sempre ligado. O Supabase grátis "dorme" depois de 1 semana parado e demora pra acordar, por isso ficou de fora.

- [ ] `[Thiago]` Conta Cloudflare (grátis) e uma chave do **Google AI Studio com cobrança ligada**. No plano grátis o Google pode usar as fotos pra treinar a IA. No pago, não. O gasto fica em centavos, dá pra configurar alerta de gasto no Google, e o teto de verdade quem aplica é a nossa API (ver "teto diário" abaixo).
- [ ] `GET /v1/produto/{código}` — procura na base própria → Open Food Facts (o servidor manda o *User-Agent* que eles pedem) → responde `sem_cadastro`. Com cache, o 2º usuário recebe na hora.
- [ ] `POST /v1/rotulo` — recebe a foto, manda pro **Gemini Flash-Lite**, que devolve JSON pronto (ingredientes, alérgenos, tabela nutricional, lupa "ALTO EM"), grava **por código de barras** e responde o veredito. **A foto não é guardada**: é lida na memória e descartada. Fica só o texto.
- [ ] `POST /v1/rotulo-texto` — o Android manda o texto que o ML Kit leu e o servidor organiza (texto é ainda mais barato que foto).
- [ ] Site no iPhone: botão de câmera com `capture="environment"`, que abre direto a câmera traseira sem salvar no rolo. A foto é reduzida no próprio celular antes de subir (fica mais rápido e mais barato). Some o "Escanear Texto" do textarea.
- [ ] Proteção contra abuso: Cloudflare Turnstile (captcha invisível, grátis), limite por IP, **teto diário de gasto com IA** (passou do teto, a IA pausa e o app avisa com um ícone) e limite de tamanho da foto.
- [ ] Antes de ligar: teste com **30 fotos reais** de rótulo (brilho, curva, letra miúda). Só vai pro ar se acertar os ingredientes em ≥ 28/30. O modelo é uma configuração do servidor e dá pra trocar sem mexer no app.
- **Pronto quando:** no iPhone, produto sem cadastro sai com veredito em até ~5 s depois da foto, e o mesmo produto escaneado por outra pessoa sai na hora, sem IA.

## Fase 2 — A base brasileira que cresce sozinha

- [ ] Proteção contra dado errado: cada leitura guarda a fonte (foto+IA, texto do ML Kit, digitado). Se uma leitura nova diverge da anterior, o produto é marcado pra revisão.
- [ ] Devolver ao **Open Food Facts** os produtos que a gente leu. A base deles cresce, o Yuka e outros apps também ganham, e o nosso app vira fonte de dado brasileiro.
- [ ] Números que importam, sem guardar dado pessoal: % de códigos encontrados, tempo até o veredito, quantos produtos novos por dia.
- [ ] Domínio próprio (ex.: `levaounao.com.br`, ~R$ 40/ano) e o site passa do GitHub Pages pro Cloudflare Pages (cabeçalhos de segurança de verdade, tudo numa conta só).

## Fase 3 — Qualquer código de barras

- [ ] Mesma API, mais bases grátis da mesma família do Open Food Facts: **Beauty** (cosméticos), **Pet Food** e **Products** (limpeza, geral).
- [ ] Motor de regras **por categoria** (alimento, cosmético, pet, limpeza), cada uma com um mini ícone. O usuário não escolhe nada: o código de barras diz a categoria.
- [ ] Remédio: só informação (nome, princípio ativo, preço máximo da CMED/Anvisa), **nunca** "leva ou não". Veredito sobre remédio é assunto de saúde e pode dar problema legal.
- [ ] Bases pagas brasileiras (Bluesoft Cosmos a partir de ~R$ 500/mês, GS1 Brasil com filiação) só quando o app pagar isso.

## Fase 4 — Lojas

- [ ] `[Thiago]` Google Play: US$ 25 uma vez só (≈ R$ 130). Publica o AAB assinado da Fase 0. O checklist e a política de privacidade já estão em `docs/`.
- [ ] `[Thiago]` App Store: US$ 99/ano (≈ R$ 514), só quando houver receita. O CI gera o app de iPhone num Mac do GitHub, e aí o iPhone lê o rótulo no aparelho, de graça.

## O que já está bom (não mexer)

- Nenhum dado do Open Food Facts nem do OCR vai pra tela como HTML, então não há brecha de injeção de código.
- Leitor de código de barras em WebAssembly lendo a faixa central: rápido e já testado no mercado.
- Publicação automática (site + APK) a cada push na main.
