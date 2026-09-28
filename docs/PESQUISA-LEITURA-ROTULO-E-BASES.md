# Pesquisa: leitura de rótulo (OCR/Visão) e bases de dados de código de barras — "Leva ou não?"

> Pesquisa completa (6 seções + sumário + recomendação + lista de não-confirmados).
> Câmbio usado em toda a conversão R$: **1 USD = R$ 5,1895** (fonte: `open.er-api.com/v6/latest/USD`, consultado 2026-09-28 00:02 UTC). Preços mudam — cada valor abaixo tem fonte + data em que foi visto.

Data da pesquisa: 2026-09-28.

---

## Sumário executivo

**O problema é real e nenhum concorrente resolve bem**: até o Desrotulando (app brasileiro, anos de operação, equipe de nutricionista) tem 266 mil produtos na fila esperando entrar contra só 20 mil já cadastrados — 13x mais fila que catálogo. Yuka (chegou no Brasil em jul/2026) também depende de contribuição manual/curada quando falta produto. Resolver isso com OCR automático em vez de fila manual é a maior diferenciação possível.

**OCR/visão é barato de sobra na escala do app**: como cada produto só é processado 1 vez (cache compartilhado), mesmo 10.000 produtos NOVOS por mês custam ~R$17-32 com o modelo pago mais barato testado (Gemini 2.5 Flash-Lite) — e pode ficar em R$0 dentro da camada grátis se o volume mensal de produtos NOVOS ficar abaixo de ~500/dia. O custo nunca vai ser o gargalo.

**No iPhone, web SEMPRE depende de servidor**: Safari nunca implementou OCR local (Shape Detection API não existe no WebKit) — então pro público da web, mandar a foto pra uma API própria não é só "a opção mais barata", é a ÚNICA opção tecnicamente possível. Isso valida diretamente o plano do Thiago de construir a própria API.

**iOS nativo dá pra fazer sem gastar com Mac**: GitHub Actions tem runner macOS grátis ilimitado em repositório público, e o app já teria o mesmo plugin ML Kit usado no Android (funciona em iOS também) — só falta decidir se compensa o esforço de manter um app nativo separado do site.

**Bases de GTIN brasileiras pagas (Cosmos, GS1) são caras/burocráticas demais pra fase hobby** — o caminho mais barato pra cobrir o que falta continua sendo OCR de rótulo + Open Food Facts/irmãs (grátis) + contribuir de volta.

---

## 1. Visão/OCR para ler lista de ingredientes em fotos de rótulo brasileiro

### O que muda o custo pra valer: o "truque do redimensionamento"

Todo provedor de IA com visão cobra por **quantos pedaços (tiles) a imagem vira**, não pelo tamanho do arquivo. Foto de celular sai gigante (ex.: 3000×4000px) e isso é *muito* caro à toa — dá pra cortar o custo em até 90%+ só redimensionando ANTES de enviar:

- **Gemini**: divide a imagem em blocos de 768px; cada bloco = 258 tokens. Uma foto 800×800 vira 4 blocos (1032 tokens); a MESMA foto cortada/redimensionada pra 768×768 vira 1 bloco só (258 tokens) — 75% mais barato, sem perda de qualidade prática. Fonte: [dev.to — Gemini API Image Token Economics](https://dev.to/kushaagr/can-image-tokens-cost-less-than-text-tokens-explaining-gemini-api-image-token-economics-422c) e [GitHub PR — downscale 6-12x mais barato](https://github.com/aman02899999/Adi-Jyotish-saas/pull/21), vistos 2026-09-28.
- **OpenAI**: redimensiona a imagem pra caber numa caixa de 2048px, depois o lado curto vai pra ~768px, e conta ladrilhos de 512×512 = 85 tokens fixos + 170 tokens por ladrilho. Fonte: [OpenAI — Images and vision](https://developers.openai.com/api/docs/guides/images-vision), visto 2026-09-28.
- **Claude (Anthropic)**: aproximação `tokens ≈ (largura_px × altura_px) / 750`, com teto de ~2576px no lado maior (Opus 4.7). Uma foto 2000×2000 sem redimensionar custa ~5300 tokens de entrada. Fonte: [platform.claude.com/docs/build-with-claude/vision](https://platform.claude.com/docs/en/build-with-claude/vision) + [usewalkie.com — Claude image token formula](https://usewalkie.com/blog/claude-image-token-calculation-explained/), vistos 2026-09-28.

**Prática recomendada**: redimensionar a foto no PRÓPRIO celular/navegador (canvas do browser ou plugin nativo) para ~1024px no lado maior antes de mandar pra API. Isso é fácil de fazer tanto no app Android (Capacitor) quanto na web (canvas) — e também deixa o upload mais rápido pro usuário com internet ruim.

### Comparação de custo (cenário: 1 foto → JSON estruturado com ingredientes + alérgenos + tabela nutricional + flags "ALTO EM")

Premissas usadas nas contas abaixo: foto redimensionada para ~1024×1024px antes do envio, prompt de instrução ~200 tokens de texto, resposta em JSON estruturado ~500 tokens. Câmbio: R$ 5,1895/US$ (2026-09-28).

| Provedor / modelo | Preço oficial | Retorna JSON estruturado em 1 chamada? | Custo estimado por imagem | **R$ por 1000 imagens** | Fonte (data) |
|---|---|---|---|---|---|
| **Google Gemini 2.5 Flash-Lite** (paga, tier padrão) | Entrada US$0,10/1M tok (texto/imagem), saída US$0,40/1M tok | **Sim** — `responseSchema`/JSON mode nativo, inclusive com imagem | ~US$0,00032 | **≈ R$ 1,68** | [ai.google.dev/gemini-api/docs/pricing](https://ai.google.dev/gemini-api/docs/pricing), 2026-09-28 |
| **Google Gemini 2.5 Flash-Lite** (AI Studio, camada GRÁTIS) | US$0 até 500 requisições/dia (limite compartilhado com o Flash) | Sim | US$0 | **R$ 0** (mas ver ressalva de privacidade abaixo) | idem |
| **OpenAI GPT-5 Mini** (visão) | Entrada US$0,125/1M tok, saída US$1,00/1M tok | Sim — Structured Outputs (`json_schema`) | ~US$0,00062 | **≈ R$ 3,22** | [developers.openai.com/api/docs/pricing](https://developers.openai.com/api/docs/pricing), 2026-09-28 |
| **Google Cloud Vision — DOCUMENT_TEXT_DETECTION** | 1000 unidades/mês grátis, depois US$1,50/1000 (até 5M/mês) | **Não** — devolve só texto bruto, precisa de um 2º passo (regex ou LLM barato) pra virar JSON | US$0,0015 (+ custo do 2º passo) | **≈ R$ 7,78** (+ ~R$1-2 do passo de estruturação) | [cloud.google.com/vision/pricing](https://cloud.google.com/vision/pricing), 2026-09-28 |
| **AWS Textract — DetectDocumentText** | US$0,0015/página (1ª milhão), sem camada grátis permanente (só 1000 págs/mês nos 3 primeiros meses de conta nova) | Não — texto bruto só | US$0,0015 | **≈ R$ 7,78** (+ estruturação) | [aws.amazon.com/textract/pricing](https://aws.amazon.com/textract/pricing/), 2026-09-28 |
| **Mistral OCR 4 (API síncrona)** | US$4/1000 páginas (US$2/1000 em modo batch assíncrono, não serve pro "1 toque → resultado") | Markdown, não JSON pronto (JSON estruturado é o produto "Document AI", ver linha abaixo) | US$0,004 | **≈ R$ 20,76** | [mistral.ai/news/ocr-4](https://mistral.ai/news/ocr-4/), 2026-09-28 |
| **Mistral Document AI** (JSON com schema) | US$5/1000 páginas | **Sim** | US$0,005 | **≈ R$ 25,95** | idem |
| **Claude Haiku 4.5** (só referência — não recomendado como base) | Entrada US$1/1M tok, saída US$5/1M tok | Sim (tool use / JSON) | ~US$0,0041 | **≈ R$ 21,26** | [claude.com/pricing](https://claude.com/pricing), 2026-09-28 |
| **Azure AI Vision — Read** | ~US$1,50/1000 transações (tier padrão) — **número não confirmado na página oficial** (a tabela de preço da Microsoft carrega os valores via JavaScript/calculadora, não aparece em texto estático); 5000 transações/mês grátis no tier F0 | Não — texto bruto | ~US$0,0015 | **≈ R$ 7,78 (não confirmado)** | [azure.microsoft.com/pricing/details/computer-vision](https://azure.microsoft.com/en-us/pricing/details/computer-vision/) — valor exato indisponível, visto 2026-09-28; número aproximado via [successknocks.com](https://successknocks.com/microsoft-azure-ai-services-for-image/), sem data de verificação clara |
| **Cloudflare Workers AI** (modelos de visão tipo Gemma/Llava) | 10.000 "neurons" grátis por dia (reseta 00:00 UTC), depois US$0,011/1000 neurons; imagem consome ~1601-6404 tokens conforme tamanho | Depende do modelo (alguns suportam JSON mode) | Praticamente grátis na escala deste app | **≈ R$ 0** dentro da cota grátis | [developers.cloudflare.com/workers-ai/platform/pricing](https://developers.cloudflare.com/workers-ai/platform/pricing/), 2026-09-28 |
| **PaddleOCR autohospedado** (Apache-2.0, roda em servidor próprio) | Grátis (só custo do servidor) | Não nativamente — texto bruto, precisa parser próprio | Custo do servidor, não por imagem | Depende do plano de hosting (ver seção 5) | [paddlepaddle.github.io/PaddleOCR](https://paddlepaddle.github.io/PaddleOCR/main/en/index.html), 2026-09-28 |

**Conclusão de custo**: na escala deste app (só produtos NOVOS entram no cache — nunca se paga 2x pelo mesmo produto), mesmo o mais caro da lista (Mistral Document AI, R$26/1000) dá R$2,60 pra 100 produtos novos/mês. O Gemini Flash-Lite é ~15x mais barato que isso e ainda devolve o JSON pronto.

### Cenários de custo pedidos (100 / 1.000 / 10.000 produtos NOVOS por mês) — top 3

| Produtos novos/mês | Gemini 2.5 Flash-Lite (pago) | OpenAI GPT-5 Mini | Google Cloud Vision + estruturação |
|---|---|---|---|
| 100 | R$ 0,17 (ou R$0 na camada grátis, 500/dia cobre fácil) | R$ 0,32 | R$ 0 (dentro dos 1000 grátis) |
| 1.000 | R$ 1,68 (ou R$0 na camada grátis, se ficar <500/dia) | R$ 3,22 | R$ 0 (ainda dentro dos 1000 grátis/mês, no limite) |
| 10.000 | R$ 16,80 | R$ 32,20 | ~R$ 14 (9000 unidades pagas × R$1,50/1000 + estruturação) |

Em todos os casos: **valores irrisórios**, o gargalo nunca vai ser o custo de IA nessa escala — é mais sobre confiabilidade/qualidade e complexidade de manter 2 sistemas (OCR + parser) vs. 1 (visão com JSON nativo).

### Qualidade para este caso de uso específico (embalagem brasileira, brilhante, curva, letra miúda)

- Não encontrei benchmark específico com rótulos de alimentos BRASILEIROS. O mais próximo e relevante: estudo acadêmico **"Evaluating OCR performance on food packaging labels in South Africa"** (2026), testando Tesseract, EasyOCR, PaddleOCR e TrOCR em 231 produtos/1628 fotos reais de celular em ambiente de varejo — o estudo cita explicitamente "glare, shadows, and curved or reflective surfaces that distort text" como os mesmos problemas que Thiago descreve. Resultado: **Tesseract teve o menor erro** (CER 0,91 / WER 6,26) entre os 4 OCRs clássicos testados, mas todos tiveram taxa de erro relevante (WER 6-7 significa ~1 em cada 6-7 palavras errada) — ou seja, **OCR clássico "cru" (sem LLM) tem dificuldade real com esse tipo de embalagem**, confirmando a experiência ruim do Thiago com Tesseract.js. Fonte: [arxiv.org/html/2510.03570](https://arxiv.org/html/2510.03570), visto 2026-09-28.
- Benchmarks gerais (não específicos de rótulo) mostram que **modelos de visão com LLM (Gemini, GPT-4o/5, Claude) superam OCR clássico em 10-15 pontos percentuais de acurácia em documentos degradados/scaneados**, e Gemini 2.5 Pro atinge ~94% em faturas escaneadas num benchmark independente. Isso é consistente com a experiência de mercado: **use um modelo de visão LLM (Gemini/GPT), não OCR clássico, para rótulos difíceis** — o modelo "entende" o texto mesmo com reflexo/curvatura porque não depende só de contornos de caractere, ele infere pelo contexto. Fonte: [github.com/getomni-ai/benchmark](https://github.com/getomni-ai/benchmark) e [parsli.co — LLM OCR vs Traditional OCR 2026](https://parsli.co/blog/llm-ocr-vs-traditional-ocr), vistos 2026-09-28 (números desses agregadores não são de fonte 1ª parte, tratar como indicativo, não oficial).
- Velocidade: Google Cloud Vision (OCR clássico) responde rápido, ~869ms por requisição (fonte agregadora, não oficial). Modelos LLM de visão (Gemini Flash/Flash-Lite, GPT-5 Mini) costumam responder em poucos segundos (não achei número oficial de latência do Google/OpenAI para Flash-Lite especificamente — **não confirmado**, mas na prática de mercado Flash/Flash-Lite costuma ficar na faixa de 1-4s para uma imagem simples).

### Privacidade / uso dos dados nas camadas grátis

- **Google AI Studio (camada grátis do Gemini)**: uso é grátis, mas o Google **usa os dados pra melhorar os produtos** (inclusive treino) por padrão — igual free tier de qualquer IA generativa. Na **camada PAGA** (billing habilitado), o Google **não usa prompts/respostas pra treinar modelos**. Fonte: [ai.google.dev/gemini-api/docs/pricing](https://ai.google.dev/gemini-api/docs/pricing) + [discuss.ai.google.dev/t/privacy-of-data-in-tier-1](https://discuss.ai.google.dev/t/privacy-of-data-in-tier-1/102251), vistos 2026-09-28. Como são fotos de embalagem de produto (não dado pessoal sensível), o risco é baixo, mas vale usar a camada PAGA em produção pra não achar estranho o Google "aprender" com fotos dos usuários — e porque com cache de produto, o volume real de chamadas pagas é pequeno mesmo (ver tabela acima).

---

## 2. iOS — reconhecimento de texto nativo e build sem Mac

### Reconhecimento de texto no próprio iPhone (sem servidor)

- **Apple Vision (`VNRecognizeTextRequest`)**: suporta **português (inclui pt-BR)** desde a `VNRecognizeTextRequestRevision2` (iOS 14+), tanto no nível "accurate" quanto "fast". É a tecnologia por trás do "Escanear Texto" que Thiago já usa (e acha ruim de usar, não de qualidade). Fonte: [developer.apple.com/documentation/vision/vnrecognizetextrequest](https://developer.apple.com/documentation/vision/vnrecognizetextrequest) (achado via busca, não fetch direto — a doc oficial não lista idiomas em texto simples, número exato de revisão confirmado por múltiplas fontes de terceiros consistentes), visto 2026-09-28.
- **VisionKit `DataScannerViewController`** (iOS 16+, "Live Text" ao vivo com câmera): usa os mesmos idiomas do Live Text; se nenhum idioma for passado, usa os idiomas preferidos do usuário no aparelho. Não achei a lista oficial completa de idiomas em uma página só — **não 100% confirmado que pt-BR está na lista**, mas como o Live Text do sistema já funciona em português no Brasil (é o que hoje dá o "Escanear Texto" que o Thiago usa), é razoável assumir que sim. Fonte: [developer.apple.com/documentation/visionkit/datascannerviewcontroller](https://developer.apple.com/documentation/visionkit/datascannerviewcontroller), visto 2026-09-28.
- **Conclusão**: dá pra fazer OCR 100% no aparelho, de graça, sem internet, com boa precisão em português — MAS só dentro de um app nativo real (Swift/SwiftUI ou via plugin nativo Capacitor). **O Safari NÃO expõe essas APIs para páginas web** (ver seção 3).

### O plugin ML Kit que já é usado no Android funciona em iOS?

**Sim.** O `@pantrist/capacitor-plugin-ml-kit-text-recognition` declara suporte a iOS — o método `detectText` funciona tanto em Android quanto em iOS (via CocoaPods, usando o SDK do Google ML Kit para iOS, que é *separado* do Vision da Apple, mas roda no aparelho e é grátis). Repositório: [github.com/Pantrist-dev/capacitor-plugin-ml-kit-text-recognition](https://github.com/Pantrist-dev/capacitor-plugin-ml-kit-text-recognition), visto 2026-09-28 (README exato não pôde ser lido — GitHub bloqueou o fetch direto com 403 — confirmação via resultados de busca que citam o código-fonte). **Existe uma alternativa mantida por uma empresa (Capawesome), `@capacitor-mlkit/text-recognition`, também com suporte iOS confirmado**, considerada mais ativa/madura: [capawesome.io/docs/sdks/capacitor/mlkit/text-recognition](https://capawesome.io/docs/sdks/capacitor/mlkit/text-recognition), visto 2026-09-28 — vale considerar migrar pra essa se o app nativo iOS sair do papel, mesmo plugin nos dois lados (Android e iOS) = 1 código só de UI.

### Dá pra compilar o app iOS SEM ter um Mac?

**Sim, de forma madura e documentada.** GitHub Actions oferece runners macOS **grátis e sem limite de minutos em repositórios PÚBLICOS** (o multiplicador de 10x do custo de minutos macOS só se aplica a repositórios PRIVADOS, que consomem da cota paga). Fonte: [dev.to — GitHub Actions free macOS minutes explained](https://dev.to/maclessdev/github-actions-free-macos-minutes-explained-33p7) + [docs.github.com/billing/reference/actions-runner-pricing](https://docs.github.com/en/billing/reference/actions-runner-pricing), vistos 2026-09-28. **Atenção**: isso exige que o repositório do app seja público no GitHub — repo privado pagaria pelos minutos macOS (10x mais caro que Linux).

Fluxo recomendado (usado por vários projetos reais sem Mac): **Fastlane** rodando dentro do runner macOS do GitHub Actions, autenticando na App Store Connect via **chave de API (.p8 + Key ID + Issuer ID)** — não precisa de 2FA nem de sessão de Apple ID, é feito pra CI. Build típico leva ~15 minutos. Fonte: [docs.fastlane.tools/best-practices/continuous-integration/github](https://docs.fastlane.tools/best-practices/continuous-integration/github/) + exemplos reais (LoopKit/LoopWorkspace, iAPS), vistos 2026-09-28.

### Custo da conta de desenvolvedor Apple

**US$ 99/ano** (≈ **R$ 514/ano**), pessoa física ou empresa, cobre apps ilimitados numa conta só, sem taxa por app. Fonte: [developer.apple.com/programs/enroll](https://developer.apple.com/programs/enroll/), visto 2026-09-28.

### Risco de reprovação na App Store

O app não faz diagnóstico médico nem mede nada com sensor (não é o caso de risco mais alto do guideline, que é apps que alegam medir pressão/glicose etc. com o celular). O risco real é ficar na categoria "apps de saúde/nutrição que dão recomendação": a Apple pede que a metodologia por trás de qualquer alegação de saúde seja divulgável, e recomenda deixar claro que o app **não substitui orientação profissional**. Como já existem apps praticamente idênticos aprovados na App Store (Yuka, e outros leitores de rótulo com semáforo nutricional), **o precedente existe e o risco é gerenciável** — o cuidado prático é: (1) ter um aviso claro tipo "não substitui orientação de nutricionista/médico" no app e nos termos, (2) não usar linguagem de "diagnóstico" ou "tratamento", só classificação nutricional/de aditivos. Fonte: [developer.apple.com/app-store/review/guidelines](https://developer.apple.com/app-store/review/guidelines/), visto 2026-09-28.

---

## 3. iOS Safari (web) — abrir câmera e OCR no navegador

### `<input type="file" accept="image/*" capture="environment">`

- **Não abre a câmera direto em 1 toque**: no iOS Safari atual, isso mostra uma folha (action sheet) com opções como "Tirar Foto ou Vídeo", "Biblioteca de Fotos" (e às vezes iCloud/Arquivos) — o usuário ainda precisa escolher "Tirar Foto" e depois apertar o obturador. Ou seja, são **2 toques** (escolher "tirar foto" na folha + apertar o obturador), não 1. Não achei confirmação de que isso mudou nas versões mais recentes do iOS — parece ser comportamento estável há anos. Fonte: discussão em [Apple Developer Forums — "Prevent action sheet on image upload"](https://developer.apple.com/forums/thread/816508) + [web.dev — Capturing an image from the user](https://web.dev/articles/media-capturing-images), vistos 2026-09-28.
- **A boa notícia — a foto NÃO fica salva no Rolo da Câmera**: confirmado em discussão de desenvolvedor da própria Apple — "quando se usa 'Tirar Foto ou Vídeo' no Safari, a imagem NÃO é guardada no Rolo da Câmera". Isso bate exatamente com o requisito de Thiago (foto descartável, nunca salva) **de graça, sem precisar escrever nenhum código especial pra isso** — é o comportamento padrão do navegador. Fonte: [Apple Developer Forums — "Store 'Take Photo or Video' Image to Camera Roll"](https://discussions.apple.com/thread/254480145), visto 2026-09-28.
- **Resumindo pra decisão de produto**: `<input capture="environment">` dá exatamente a garantia de privacidade que o app quer (foto descartável), ao custo de ser 2 toques em vez de 1 (aceitável — ainda é muito mais simples que o fluxo atual de "Escanear Texto" numa caixa de texto).

### Alternativa: `getUserMedia()` + `<canvas>`

Dá pra fazer uma câmera customizada dentro da própria página (preview ao vivo, indicador visual, etc.) usando `getUserMedia()` pra pegar o stream de vídeo e `canvas.getContext('2d').drawImage()` pra capturar um frame como imagem. **Limitação no iOS**: a API `ImageCapture` (que pegaria foto em resolução total nativa) **não é suportada no iOS Safari** — só dá pra capturar o frame que está sendo exibido no `<video>`, então a resolução fica limitada à do preview de vídeo (potencialmente pior que uma foto "de verdade" tirada pelo app Câmera). Além disso, essa abordagem exige pedir permissão de câmera explicitamente pela página (prompt "site quer usar a câmera"), o que o `<input capture>` evita (delega pro seletor nativo do sistema). Fonte: [Apple Developer Forums — "getUserMedia resolution"](https://developer.apple.com/forums/thread/113532), visto 2026-09-28.

**Recomendação prática**: usar `<input capture="environment">` — é mais simples, já resolve a privacidade (não salva no rolo) de graça, e a perda de "1 toque em vez de 2" é pequena comparada ao ganho de resolução de foto real (câmera nativa) vs. frame de preview de vídeo.

### OCR local pelo navegador no iPhone? Não existe.

A **Shape Detection API** do W3C/WICG tem uma parte chamada `TextDetector` que faria OCR nativo direto no JavaScript do navegador — mas ela **nunca foi implementada no Safari/WebKit**, e a própria especificação foi rebaixada para "informativa" (não padronizada o bastante entre plataformas pra virar padrão de verdade). Há um bug aberto no WebKit confirmando "Shape Detection API doesn't work on iOS". Mesmo no Chrome (Android), o `TextDetector` está atrás de flag experimental — só o `BarcodeDetector` (pra código de barras, não texto) está disponível de forma estável. **Conclusão: no Safari do iPhone, não existe nenhuma forma de fazer OCR local pela página web — o app web SEMPRE vai precisar mandar a foto pra um servidor/API fazer a leitura.** Isso reforça que, pro público iPhone da web, a arquitetura "tira foto → manda pra API própria → recebe JSON" (seção 1) é a única opção viável — sem alternativa nativa-no-navegador. Fontes: [wicg.github.io/shape-detection-api/text.html](https://wicg.github.io/shape-detection-api/text.html) + [bugs.webkit.org/show_bug.cgi?id=281848](https://bugs.webkit.org/show_bug.cgi?id=281848) + [developer.chrome.com/docs/capabilities/shape-detection](https://developer.chrome.com/docs/capabilities/shape-detection), vistos 2026-09-28.

---

## 4. Bases de dados de código de barras (GTIN) brasileiras e internacionais

### Open Food Facts e "irmãs" (Beauty / Pet Food / Products) — grátis, e já dá pra expandir pra qualquer produto

O mesmo projeto Open Food Facts mantém **4 bases separadas com a mesma API**: Open Food Facts (comida), **Open Beauty Facts** (cosméticos), **Open Pet Food Facts** (ração/petisco de pet) e **Open Products Facts** ("qualquer outra coisa" — limpeza, bens gerais). Todas são gratuitas, mesma estrutura de API, e dá pra escanear um código e consultar as 4 de uma vez com um parâmetro `product_type`. Isso **já é o caminho pronto pra expansão "qualquer código de barras"** que o Thiago quer fazer depois — não precisa reinventar, é só apontar pra base certa. Cobertura de produtos brasileiros nessas bases "irmãs" tende a ser bem mais fraca que a de alimentos (Open Pet Food Facts tinha só ~13 mil produtos globais em jun/2026) — o problema de "produto não cadastrado" vai ser proporcionalmente PIOR nessas categorias, o que reforça a importância do pipeline de OCR fallback. Fontes: [openfoodfacts.github.io — scanning cosmetics, pet food and other products](https://openfoodfacts.github.io/documentation/docs/Product-Opener/api/tutorials/scanning-cosmetics-pet-food-and-other-products/), [world.openbeautyfacts.org/data](https://world.openbeautyfacts.org/data), [world.openpetfoodfacts.org/data](https://world.openpetfoodfacts.org/data), vistos 2026-09-28.

### Licença ODbL — o que significa "compartilhar de volta" na prática

A base do Open Food Facts (e das irmãs) é licenciada em **ODbL (Open Database License)**, que exige 2 coisas: **atribuição** (creditar "Contains data from Open Food Facts, available under the Open Database License" em qualquer uso público) e **share-alike** (se você publicar uma **base de dados adaptada** — ou seja, combinar dados do OFF com dados próprios e distribuir/oferecer essa combinação publicamente — essa base combinada também precisa ser aberta em ODbL). **Ponto importante pra decisão de produto**: a licença distingue "banco de dados derivado" de "obra produzida" (*produced work*) — uma tela de produto, um veredito "leva ou não" calculado, um resumo mostrado ao usuário = obra produzida, **não** precisa ser aberta. Ou seja: o app pode ter seu cache próprio (produtos + OCR + veredito) sem precisar publicar esse cache — só precisa (1) creditar o Open Food Facts como fonte nos produtos que vieram de lá, e (2) só abriria obrigatoriamente se decidisse publicar/vender o BANCO DE DADOS em si (não o app) como um dump combinado. Fontes: [opendatacommons.org/licenses/odbl/1-0](https://opendatacommons.org/licenses/odbl/1-0/), [world.openfoodfacts.org/terms-of-use](https://world.openfoodfacts.org/terms-of-use), [dev.to — What ODbL Means for Commercial Nutrition Apps](https://dev.to/dietly/what-odbl-means-for-commercial-nutrition-apps-4hl7), vistos 2026-09-28.

### Contribuir produtos novos de volta pro Open Food Facts (recomendado, e "no espírito" do share-alike)

A API do OFF tem um modo de escrita (adicionar/editar produto, subir foto, editar ingredientes) que exige autenticação. Dá pra criar **uma conta única do app** (não precisa pedir cada usuário pra criar conta no site do OFF) mandando `app_name`, `app_version` e `app_uuid` (um UUID salgado por usuário) nas chamadas de escrita — assim a moderação do OFF consegue banir um usuário problemático sem banir o app inteiro. **Toda chamada à API (leitura ou escrita) exige um cabeçalho `User-Agent` identificando o app + um contato** (ex.: `LevaOuNao/1.0 (contato@...)`) — é política obrigatória, não sugestão. Mandar de volta os produtos que o app descobrir via OCR (que não estavam no OFF) é exatamente o espírito da obrigação de share-alike, e também beneficia o próprio app: quanto mais produtos brasileiros entrarem no OFF, menos vezes o app vai precisar gastar com OCR no futuro (inclusive pra outros usuários). Fonte: [openfoodfacts.github.io/openfoodfacts-server/api](https://openfoodfacts.github.io/openfoodfacts-server/api/), [github.com/domdomegg/openfoodfacts-mcp](https://github.com/domdomegg/openfoodfacts-mcp), vistos 2026-09-28.

### Bases brasileiras pagas (comerciais)

| Fonte | O que é | Preço | Observações |
|---|---|---|---|
| **Bluesoft Cosmos** | Maior catálogo de produtos do Brasil, **18 milhões de itens**, com GTIN/EAN, NCM, categoria, marca, imagem | **A partir de R$ 499,99/mês** (não achei mais detalhe de faixas — a página de preços bloqueou o fetch automático com 403; valor mínimo confirmado por múltiplas fontes de terceiros) | Caro demais pra fase hobby/grátis do app — cogitar só se o app começar a gerar receita. Licença de uso/redistribuição dos dados **não confirmada** (não achei se dá pra cachear os dados retornados). Fonte: [cosmos.bluesoft.com.br/api-pricings](https://cosmos.bluesoft.com.br/api-pricings), visto 2026-09-28 (valor via busca, página bloqueou fetch direto) |
| **GS1 Brasil — Cadastro Nacional de Produtos (CNP) / Verified by GS1** | Base "oficial" — é onde a PRÓPRIA marca registra o GTIN dela. Mais confiável pra dado tributário/logístico, mas cobertura depende de cada marca ter cadastrado | Acesso ao CNP é **grátis só pra associados GS1**; virar associado custa **taxa de adesão ~R$ 683 + metade da anuidade**, depois anuidade anual conforme faturamento (empresa até R$300mil/ano = R$367/ano, categoria T4). O preço específico da API "Verified by GS1" **não é público** — é sob consulta com o time comercial | Caminho burocrático e caro pra um app hobby; não é uma "API que se assina e usa", é uma filiação institucional. Fontes: [gs1br.org/tabela-de-valores](https://www.gs1br.org/tabela-de-valores), [apicnp.gs1br.org/api-portal](https://apicnp.gs1br.org/api-portal/content/base-de-produtos-nacionais), vistos 2026-09-28 |
| **Kodebar** (brasileira, pequena) | API brasileira simples: nome, marca, foto, GTIN — SEM dado nutricional/ingrediente | **Grátis até 50 consultas/dia** (sem cartão), planos pagos a partir de **R$29/mês** (faixas de 2.250 a 75.000 consultas/mês) | Não serve pra pegar ingredientes (não tem esse dado), mas é uma opção barata pra pelo menos identificar nome/marca/foto de um produto brasileiro qualquer quando nem OFF nem Cosmos têm. Fonte: [kodebar.korvensistemas.com.br](https://kodebar.korvensistemas.com.br/), visto 2026-09-28 |

### Bases internacionais genéricas (cobertura de produto brasileiro incerta)

| Fonte | Preço | Observação |
|---|---|---|
| **UPCitemdb** | Grátis: 100 consultas/dia (sem cadastro). Pago: **US$99/mês** (20.000 lookups/dia) ou **US$699/mês** (150.000/dia) | Base majoritariamente americana (UPC); cobertura de EAN/produto brasileiro **não confirmada, provavelmente fraca**. Fonte: [upcitemdb.com/api](https://upcitemdb.com/api) + [upcitemdb.com/wp/docs/.../plan](https://www.upcitemdb.com/wp/docs/main/development/plan/), vistos 2026-09-28 |
| **Barcode Lookup** (via RapidAPI) | US$99/mês (5.000 req) até US$499/mês (100.000 req) | Também majoritariamente base americana/global; cobertura BR incerta. Fonte: [rapidapi.com/barcodelookup/api/barcode-lookup/pricing](https://rapidapi.com/barcodelookup/api/barcode-lookup/pricing), visto 2026-09-28 |
| **EAN-Search.org** | Sem camada grátis permanente. Trial 1€ (100 consultas), depois planos desde **19€/mês** (5.000 consultas) até 149€/mês (300.000) | Base global de 1,2 bilhão de códigos (agrega várias fontes); cobertura BR **não confirmada** em profundidade, mas por ser baseada em GTIN global tende a achar pelo menos "existe/marca" de produtos BR com código GS1 válido. Fonte: [ean-search.org/ean-database-api.html](https://www.ean-search.org/ean-database-api.html), visto 2026-09-28 |

**Conclusão**: nenhuma dessas bases genéricas parece ter cobertura boa de produto brasileiro de mercado/farmácia local — são todas mais fortes em produto americano/global de e-commerce. Pra completar o que falta no Brasil, o caminho é mesmo o pipeline de OCR (seção 1), não comprar acesso a mais uma base de terceiro.

### Medicamentos (Anvisa/CMED) — tem opção 100% grátis

Pra remédios especificamente, a **Anvisa já publica dado aberto e gratuito** com o campo de Código EAN (gerado/atribuído pela CMED — Câmara de Regulação do Mercado de Medicamentos): CSV público em [dados.anvisa.gov.br/dados/DADOS_ABERTOS_MEDICAMENTOS.csv](https://dados.anvisa.gov.br/dados/DADOS_ABERTOS_MEDICAMENTOS.csv), sem custo, dado público/governamental — dá pra baixar e indexar isso 1x e manter atualizado periodicamente **de graça**, em vez de pagar API de terceiro. Existem inclusive projetos open-source no GitHub que já fazem esse trabalho de transformar o CSV em API/JSON (ex.: `breno12321/medAnvisaPrice`, `amaurymartin/anvisa-medicament`) — dá pra usar de referência ou até reaproveitar código. Se quiser algo pronto e comercial em vez de montar isso: **PharmaDB** (brasileira) tem 29 mil produtos com EAN + preço CMED + bulas + interações medicamentosas, R$97/mês (250 req/dia) a R$447/mês (10.000 req/dia), sem camada grátis permanente (só trial de 7 dias). Fontes: [gov.br/anvisa/pt-br/acessoainformacao/dadosabertos](https://www.gov.br/anvisa/pt-br/acessoainformacao/dadosabertos), [pharmadb.com.br](https://pharmadb.com.br/), vistos 2026-09-28.

---

## 5. Backend barato para hospedar a API

### Cloudflare Workers + D1 + R2 — provavelmente a melhor opção grátis pra esse app

| Serviço | O que faz no app | Limite grátis |
|---|---|---|
| **Workers** | Roda o código da API (lookup, chama o OCR, aplica as regras, devolve o veredito) | 100.000 requisições/dia, 10ms de CPU por chamada |
| **D1** (banco SQL) | Guarda o cache de produtos já processados (código de barras → ingredientes → veredito) | 5 GB de armazenamento, 5 milhões de leituras/dia, 100 mil escritas/dia |
| **R2** (armazenamento de arquivo) | Se precisar guardar algo temporário (não é pra guardar foto do usuário, já que a foto é descartável) | 10 GB/mês, 1 milhão de operações classe A/mês, 10 milhões classe B/mês |

Pra um app hobby com centenas/poucos milhares de consultas por dia, esses limites são folgados — dificilmente vai estourar. Importante: desde **1º de setembro de 2026** a Cloudflare passou a **bloquear de verdade** (erro, não só "degrada") quando o D1 estoura o limite diário de leitura/escrita em conta grátis — antes disso passava meio "de graça" às vezes, agora não. Fontes: [developers.cloudflare.com/changelog — D1 free tier limit enforcement](https://developers.cloudflare.com/changelog/post/2026-09-01-d1-free-tier-limit-enforcement/), [dev.to/nayankyada — Cloudflare Pages Pricing 2026](https://dev.to/nayankyada/cloudflare-pages-pricing-2026-free-tier-limits-workers-costs-when-to-upgrade-2ono), vistos 2026-09-28.

### Supabase — alternativa, mas com um "porém" importante pro caso de uso

Free tier: 500 MB de banco Postgres, 500.000 execuções de Edge Function/mês, 5 GB de banda de saída/mês, até 2 projetos ativos por conta. **O detalhe que importa pro Thiago**: projeto grátis **pausa depois de 1 semana sem atividade no banco de dados** (visita ao painel ou requisição com resposta em cache NÃO conta como atividade) — e a primeira requisição depois de pausado demora **10 a 30 segundos pra "acordar"** o Postgres. Pra um app que pode ficar dias sem uso enquanto o Thiago não divulga/promove, isso é um risco real de UX (primeiro usuário do dia esperando 20s). Dá pra pausar de vitrine, o projeto fica salvo por 1 ano. Fontes: [supabase.com/docs/guides/platform/free-project-pausing](https://supabase.com/docs/guides/platform/free-project-pausing), [dev.to/nayankyada — Supabase Pricing 2026](https://dev.to/nayankyada/supabase-pricing-2026-free-tier-limits-compute-costs-when-to-upgrade-52af), vistos 2026-09-28.

**Comparação direta pro caso de uso**: Cloudflare Workers não "dorme" (é serverless de verdade, sem cold-start de banco tradicional) — pra uma API que pode ficar ociosa por dias e depois receber uma consulta isolada, isso é uma vantagem real sobre o Supabase. Recomendo **Cloudflare (Workers+D1+R2)** como escolha principal.

### Proteção contra abuso numa API pública sem login

Como a API vai ser chamada sem o usuário logar (tanto do site quanto do APK), precisa de alguma barreira contra bot/abuso raspando ou estourando custo de OCR:

- **Cloudflare Turnstile** (captcha invisível da própria Cloudflare): **grátis, sem limite de requisições publicado**, no plano padrão — só limita a 20 "widgets" (telas diferentes usando o captcha) e retenção de analytics de 7 dias, o que não é problema pra um app só. É a opção mais simples de integrar já que o backend já seria Cloudflare. Fonte: [blog.rcaptcha.app/articles/cloudflare-turnstile-pricing](https://blog.rcaptcha.app/articles/cloudflare-turnstile-pricing), [community.cloudflare.com/t/turnstile-pricing](https://community.cloudflare.com/t/turnstile-pricing/580850), vistos 2026-09-28.
- **Google Play Integrity API** (atesta que a chamada vem mesmo do APK Android instalado, não de um bot/script): tem uma cota **grátis de 10.000 verificações "standard" por dia**; se precisar de mais, dá pra pedir aumento de cota formalmente ao Google (sem preço publicado pra isso — parece continuar grátis, só depende de aprovação). Fonte: [developer.android.com/google/play/integrity](https://developer.android.com/google/play/integrity), visto 2026-09-28.
- **Apple App Attest** (equivalente da Play Integrity pro iOS, só serve se/quando existir app nativo iOS — não ajuda no Safari web): documentação da Apple não publica preço — é parte do programa de desenvolvedor (já incluso nos US$99/ano), sem cobrança adicional por chamada. **Não encontrei um limite numérico de chamadas/dia documentado** (diferente da Play Integrity que tem os 10 mil/dia claros) — marcar como não totalmente confirmado.
- Pro site (sem app instalado, sem Play Integrity/App Attest disponível), a defesa realista é **Turnstile + rate limit por IP** (ex.: limitar quantas fotos por minuto/hora um IP pode mandar pro OCR) — dá pra fazer isso direto no Worker sem custo extra.

Fontes gerais: [developer.android.com/google/play/integrity](https://developer.android.com/google/play/integrity), [firebase.google.com/docs/app-check/android/play-integrity-provider](https://firebase.google.com/docs/app-check/android/play-integrity-provider), vistos 2026-09-28.

---

## 6. Concorrentes

### Yuka — chegou no Brasil em julho de 2026

O app francês Yuka (85 milhões de usuários em 15 países) lançou oficialmente no Brasil em **julho de 2026**, com uma base inicial de **600 mil produtos já cadastrados**. Funciona igual ao "Leva ou não?": escaneia o código de barras, dá uma nota de 0-100 com cor (verde a vermelho), cobre alimento e cosmético. Modelo de negócio é assinatura Premium (não tem propaganda nem parceria com marca — isso é parte do discurso de "independência" deles). Quando um produto não está na base, **o próprio usuário pode contribuir tirando foto do rótulo**, que passa por verificação antes de entrar na base oficial — ou seja, o Yuka tem exatamente o mesmo problema estrutural que motivou essa pesquisa (produto BR fora da base), e resolve hoje com um fluxo de contribuição manual/curada, não com OCR automático em tempo real. Isso é uma pista de que o "Leva ou não?" pode ter uma vantagem competitiva real se entregar o resultado **na hora** (via OCR) em vez de "manda a foto e espera alguém revisar depois". Não consegui achar volume de reclamação específica do Yuka no Reclame Aqui Brasil (perfil ainda muito novo por lá). Fontes: [saudedigitalnews.com.br — Yuka chega ao Brasil](https://saudedigitalnews.com.br/08/07/2026/yuka-chega-ao-brasil-com-avaliacoes-de-mais-de-600-mil-produtos-para-ajudar-consumidores-a-fazer-escolhas-mais-saudaveis/), [prnewswire.com — Yuka Expands to Brazil and Mexico](https://www.prnewswire.com/news-releases/yuka-expands-to-brazil-and-mexico-bringing-independent-product-ratings-to-millions-of-new-users-302820727.html), [techtudo.com.br](https://www.techtudo.com.br/guia/2026/07/yuka-veja-como-funciona-o-aplicativo-que-analisa-alimentos-e-cosmeticos-edapps.ghtml), vistos 2026-09-28.

### Desrotulando — app brasileiro, criado por nutricionistas

App nacional mais estabelecido nesse nicho. Funciona por scanner de código de barras + busca manual por nome/marca. **A frase mais reveladora da pesquisa inteira veio de uma das nutricionistas do projeto**: *"Hoje temos 20 mil itens e uma lista de 266 mil para entrar"* — ou seja, mesmo um app brasileiro com anos de operação e equipe de nutricionista curando manualmente tem uma fila de **13x mais produtos faltando do que já cadastrados**. Isso confirma com força que o problema "produto BR não está na base" que motivou essa pesquisa é real, estrutural, e não resolvido por nenhum concorrente atual — é exatamente o ponto onde um pipeline de OCR automático (em vez de fila manual de curadoria) pode diferenciar o "Leva ou não?". Quando o produto não está listado, o fluxo do Desrotulando hoje é "usuário fotografa o rótulo e manda pra avaliação" — sem retorno na hora, precisa esperar entrar na fila.

**Reclamações encontradas** (Reclame Aqui, nota média 4,3, 70% das reclamações resolvidas): a maioria é sobre **assinatura** — dificuldade de cancelar (Apple não deixa dev cancelar assinatura via App Store em nome do usuário), confusão de conta dupla (login por e-mail vs. login pela Apple) trocando o status Premium de lugar, e reclamação de que "diz que é grátis mas cobra pra consultar produto". Não achei reclamação específica e numerosa sobre "trava" ou "erro de câmera" além de menções pontuais e genéricas de lentidão. Fontes: [reclameaqui.com.br/empresa/desrotulando-app](https://www.reclameaqui.com.br/empresa/desrotulando-app/), [inovasocial.com.br/tecnologias-sociais/desrotulando](https://inovasocial.com.br/tecnologias-sociais/desrotulando/), vistos 2026-09-28.

### Conclusão da seção

Os dois concorrentes relevantes no Brasil (Yuka e Desrotulando) **já mostram, nas próprias falas deles, que a cobertura de produto brasileiro é o gargalo real** — e nenhum dos dois resolve isso com OCR instantâneo, só com fila de curadoria manual (mais lenta). Isso valida diretamente a aposta do Thiago: se o "Leva ou não?" conseguir dar um resultado na hora via foto (OCR fallback), ele resolve na prática o mesmo problema que Yuka e Desrotulando ainda resolvem "depois, manualmente" — essa é a maior diferenciação possível de UX pra esse nicho no Brasil hoje.

---

## Recomendação final (ranking)

1. **OCR/visão: Gemini 2.5 Flash-Lite (camada grátis primeiro, paga como fallback).** É o mais barato pago (~R$1,68/1000 imagens) E o único que fica literalmente R$0 até ~500 produtos novos/dia, retorna JSON estruturado pronto em 1 chamada só (sem passo extra de parsing), e como modelo de visão LLM tende a lidar melhor com reflexo/curvatura de embalagem do que OCR clássico (Tesseract/PaddleOCR) — que é exatamente o problema que o Thiago já teve com Tesseract.js. Usar a camada paga em produção evita a ressalva de privacidade de treino de dado da camada grátis, e o custo real na escala do app é irrisório de qualquer forma.

2. **Backend: Cloudflare Workers + D1 + R2, com Turnstile pra anti-abuso.** Free tier generoso pro volume esperado (100 mil requisições/dia, 5GB de banco), e principalmente **não tem cold-start/pausa por inatividade** como o Supabase (que pausa em 1 semana sem uso e demora até 30s pra acordar) — importante pra um app que pode ficar dias sem tráfego entre picos de divulgação. Turnstile é grátis sem teto de requisição publicado e já se integra nativamente no mesmo ecossistema.

3. **Bases de produto: Open Food Facts + Open Beauty/Pet/Products Facts como base principal (grátis), sem comprar Bluesoft Cosmos ou virar sócio GS1 por enquanto.** Cosmos custa a partir de R$500/mês e GS1 exige filiação paga e burocrática — caro/complexo demais pra fase hobby sem receita. O caminho certo é: consultar OFF/irmãs primeiro, cair pro OCR quando faltar, e **contribuir os produtos novos de volta pro OFF** (bom pro ecossistema e reduz custo futuro de OCR pra todo mundo, inclusive o próprio app).

4. **iOS: web com `<input capture="environment">` já resolve o essencial de graça; app nativo é upgrade, não bloqueio.** No Safari, essa tag já entrega exatamente o requisito de "foto descartável, nunca salva no rolo" sem escrever nenhum código de câmera customizada — só custa 1 toque a mais que o ideal. Um app nativo iOS (viável sem Mac via GitHub Actions) reaproveitaria o mesmo plugin ML Kit do Android e faria OCR 100% local e grátis, mas é esforço adicional que só compensa se o Thiago decidir investir em ter um app "de verdade" na App Store — não é pré-requisito pra melhorar a experiência de hoje.

---

## O que eu NÃO consegui confirmar

- **Preço exato do Azure AI Vision Read**: a página oficial (`azure.microsoft.com/pricing/details/computer-vision`) renderiza a tabela de preço via JavaScript/calculadora, não aparece em texto estático no fetch. Usei um número aproximado (~US$1,50/1000) de um blog agregador sem data clara de verificação — tratar como estimativa, não fato. Onde olhei: fetch direto da página oficial (2x), busca direcionada, fetch de um agregador terceiro (successknocks.com).
- **Faixas de preço detalhadas do Bluesoft Cosmos** além do valor mínimo de R$499,99/mês: a página oficial de preços (`cosmos.bluesoft.com.br/api-pricings`) bloqueou o fetch automático com 403 em duas tentativas. O valor usado veio de um resumo de busca (fonte indireta), não da página em si — Thiago precisaria acessar a página logado/manualmente pra confirmar os planos completos.
- **Preço específico da API "Verified by GS1"**: a GS1 Brasil não publica preço da API em si — só a tabela de anuidade de associação. O valor real de acesso à API fica "sob consulta comercial", não encontrei nenhuma fonte com número.
- **Lista completa de idiomas suportados pelo VisionKit `DataScannerViewController`** (se pt-BR está oficialmente listado): a documentação da Apple não lista idiomas em texto simples numa página só; inferi que sim (porque o Live Text do sistema já funciona em português) mas não é uma confirmação direta e itemizada.
- **Latência exata de resposta do Gemini Flash-Lite / GPT-5 Mini para 1 imagem**: não achei número oficial de nenhum dos dois provedores; usei estimativa de mercado ("1-4 segundos") sem fonte de primeira mão.
- **Precisão de OCR especificamente em português brasileiro** (qualquer provedor): todos os benchmarks encontrados (arXiv sul-africano, getomni-ai/benchmark, parsli.co) são em inglês ou não especificam idioma — não existe, que eu tenha achado, um benchmark de OCR/visão especificamente em rótulo de alimento brasileiro/português.
- **Conteúdo exato do README do plugin `@pantrist/capacitor-plugin-ml-kit-text-recognition`**: GitHub e npm bloquearam o fetch direto (403/404); a confirmação de suporte iOS veio de resultados de busca que citam o código-fonte, não do README lido diretamente.
- **Limite numérico de chamadas/dia do Apple App Attest**: a documentação da Apple não publica um teto explícito (diferente da Play Integrity, que tem 10 mil/dia documentados).
- **Se dá pra cachear/redistribuir dados retornados pela API do Bluesoft Cosmos**: não achei os termos de uso/licença detalhados (mesma barreira do 403 na página de preços) — importante confirmar antes de usar Cosmos pra qualquer coisa além de consulta pontual não armazenada.
- **Volume de reclamações do Yuka especificamente no Brasil**: perfil no Reclame Aqui ainda muito recente (chegada em jul/2026), não achei dado consolidado.
