# Leva ou não? — ideias pra virar produto

Hoje: uso pessoal do Thiago (site no GitHub Pages + APK Android automático).
Plano técnico por fases (API, foto do rótulo, segurança, lojas): `docs/ROADMAP-TECNICO.md`.

## O que já temos
- Leitura de código de barras ao vivo (ZXing WebAssembly / leitor nativo Android) e por foto
- Busca no Open Food Facts + regras próprias (NOVA, açúcar adicionado, adoçantes, corantes, conservantes, sal, soro de leite, % de suco)
- Analisar 1 ou comparar 2, modo bebê, histórico, visual Zicão
- Workflows: site (Pages) e APK (Releases)

- Produto sem cadastro: leitura dos ingredientes do rótulo sem IA (ML Kit no app, Escanear Texto no site) + base própria no aparelho (`baseLocal`)

## Pra vender / monetizar
- **Cobertura BR:** trocar `baseLocal` (aparelho) por servidor (Cloudflare Workers + D1, grátis): o que um usuário ler do rótulo fica disponível pra todos. Opcional: enviar pro Open Food Facts também
- **Sem IA (decisão 2026-09-28):** o rótulo é lido no aparelho e o servidor organiza por regras; custo R$ 0
- **Receita:** anúncios leves (AdMob) no plano grátis + assinatura sem anúncio e sem limite
- **Lojas:** Google Play (US$ 25 uma vez), App Store (US$ 99/ano); política de privacidade (LGPD) e aviso "não substitui nutricionista"
- **Diferenciais (feitos em 2026-09-28):** perfis 🌾 sem glúten / 🥛 sem lactose / 🍬 pouco açúcar (na dúvida o app diz "atenção", nunca "pode"; nada de promessa médica, por isso "pouco açúcar" e não "diabético") e "🔁 Tem melhor?" (1 toque: até 3 da mesma categoria no Brasil que saem "Pode levar"; é o ranking do corredor e a troca numa coisa só)
- **Fora (decisão 2026-09-28):** lista de compras. Pede tela nova, e a regra é uma tela só
- **Métricas:** % de códigos encontrados, tempo até o resultado

## Jurídico (pronto pra quando for lançar)
- Checklist: `docs/CHECKLIST-LANCAMENTO.md`
- Rascunhos: `docs/POLITICA-DE-PRIVACIDADE.md`, `docs/TERMOS-DE-USO.md`

## Concorrência
- **Yuka** (França): +85 mi de usuários, chegou ao Brasil em jul/2026 com 600 mil produtos; grátis + Premium; nota 0–100 (60% nutrição, 30% aditivos, 10% orgânico)
- **Open Food Facts** (app da base aberta), **Fooducate** (EUA)
- Nosso diferencial: comparar 2 na prateleira e dizer qual levar, modo bebê/criança, linguagem brasileira de conversa, regras da Anvisa (lupa "ALTO EM"), sugestão de troca mais natural

## Aprendizados
- iPhone não deixa página mandar foto pra IA do Claude → por isso código de barras
- Leitor de texto dentro da página (Tesseract) é fraco pra rótulo de comida (plástico curvo, letra miúda)
- ZXing em JS travava no iPhone; ZXing WebAssembly lendo a faixa central resolveu
