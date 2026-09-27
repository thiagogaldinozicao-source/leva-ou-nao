# Leva ou não? — ideias pra virar produto

Hoje: uso pessoal do Thiago (site no GitHub Pages + APK Android automático).

## O que já temos
- Leitura de código de barras ao vivo (ZXing WebAssembly / leitor nativo Android) e por foto
- Busca no Open Food Facts + regras próprias (NOVA, açúcar adicionado, adoçantes, corantes, conservantes, sal, soro de leite, % de suco)
- Analisar 1 ou comparar 2, modo bebê, histórico, visual Zicão
- Workflows: site (Pages) e APK (Releases)

## Pra vender / monetizar
- **Cobertura BR:** base própria de produtos brasileiros (cadastrar quando o Open Food Facts não tiver: foto do rótulo → IA preenche → fica salvo pra todos)
- **IA:** comentário e leitura de rótulo sem cadastro via servidor próprio (chave da API nunca no app)
- **Receita:** anúncios leves (AdMob) no plano grátis + assinatura sem anúncio e sem limite
- **Lojas:** Google Play (US$ 25 uma vez), App Store (US$ 99/ano); política de privacidade (LGPD) e aviso "não substitui nutricionista"
- **Diferenciais:** ranking do corredor ("melhores achocolatados"), sugestão de troca mais natural, lista de compras, perfis (bebê, diabético, sem glúten/lactose)
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
