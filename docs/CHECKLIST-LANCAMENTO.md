# Checklist pra lançar o Leva ou não? como produto

> Rascunho de organização, não é parecer jurídico. Antes de lançar pago, revisar com advogado (marca + termos).

## 0. Chave de assinatura (Thiago) — fazer antes do próximo APK
Sem isso o GitHub não publica APK novo: o passo "APK Android" falha e diz o que falta. A chave de teste que ficava no repo saiu porque qualquer pessoa podia usá-la pra assinar um "update" falso do app.

1. **Gerar a chave** (uma vez só, no seu computador, precisa do Java instalado):
   ```
   keytool -genkeypair -v -keystore leva-ou-nao.keystore -alias levaounao -keyalg RSA -keysize 4096 -validity 10000
   ```
   Ele pede uma senha (forte) e seu nome/empresa. `10000` dias ≈ 27 anos.
2. **Transformar o arquivo em texto (base64)** e copiar:
   - Windows (PowerShell): `[Convert]::ToBase64String([IO.File]::ReadAllBytes((Resolve-Path leva-ou-nao.keystore))) | Set-Clipboard`
   - Mac: `base64 -i leva-ou-nao.keystore | pbcopy`
   - Linux: `base64 -w0 leva-ou-nao.keystore` (copie o que aparecer)
3. **Cadastrar no GitHub**: repositório → Settings → Secrets and variables → Actions → New repository secret. São 4:

   | Nome | Valor |
   |---|---|
   | `ANDROID_KEYSTORE_BASE64` | o texto copiado no passo 2 |
   | `ANDROID_KEYSTORE_PASSWORD` | a senha do passo 1 |
   | `ANDROID_KEY_ALIAS` | `levaounao` |
   | `ANDROID_KEY_PASSWORD` | a mesma senha do passo 1 |
4. **Guardar** o arquivo `leva-ou-nao.keystore` e a senha no gerenciador de senhas (com uma cópia fora do computador). Perdeu = não dá mais pra atualizar o app. Vazou = qualquer um assina "update" falso. Nunca no repo, nunca por chat.
5. **Publicar**: Actions → APK Android → Run workflow. Nas Releases saem o `.apk` (instalar no celular) e o `.aab` (enviar pra Google Play).

**Aviso:** quem já tem o app instalado (versão de teste antiga) precisa **desinstalar uma vez** e instalar o novo. Depois disso as atualizações instalam por cima normalmente.

## 1. Identidade própria (não copiar concorrente)
- [x] Nome, logo, cores e telas próprios (visual Zicão; nada do Yuka)
- [x] Veredito próprio em 3 níveis (Pode levar / Com moderação / Deixa na prateleira), não nota 0–100
- [ ] Nunca usar notas, textos ou base de dados de outro app

## 2. Dados do Open Food Facts (licença ODbL + DbCL)
- [x] Citar a fonte em todo resultado ("Fonte: Open Food Facts" + link)
- [ ] Tela "Sobre" com a atribuição e link da licença
- [ ] Se criar base própria derivada da deles e distribuir: publicar essa base também sob ODbL
- [ ] Mandar um User-Agent/identificação nas chamadas quando tiver servidor próprio (pedido deles)

## 3. Veredito objetivo (evitar acusação de difamar marca)
- [x] Todo veredito mostra o PORQUÊ com critério verificável (ingrediente X, NOVA 4, % de açúcar adicionado)
- [x] Aviso "não substitui pediatra ou nutricionista"
- [ ] Página pública explicando os critérios (metodologia)
- [ ] Canal pra fabricante contestar dado errado (e-mail), com prazo de resposta
- [ ] Linguagem sem ofender marca ("tem X" em vez de "produto ruim/veneno")

## 4. Marca
- [ ] Buscar "Leva ou não" no INPI (busca.inpi.gov.br) pra ver se está livre
- [ ] Registrar nas classes 9 (app) e 42 (software/serviço) — pode ser no CNPJ da Zicão
- [ ] Registrar domínio (.com.br) e @ nas redes

## 5. Privacidade (LGPD)
- [x] Hoje: nenhuma foto salva, nenhum dado enviado além do código de barras pra busca
- [ ] Publicar a Política de Privacidade (rascunho em docs/POLITICA-DE-PRIVACIDADE.md)
- [ ] Se tiver conta/login, anúncios ou analytics: atualizar a política e pedir consentimento
- [ ] Anúncios (AdMob): tela de consentimento e declaração na loja

## 6. Lojas
- [ ] Google Play: conta de desenvolvedor (US$ 25, uma vez), AAB assinado, política de privacidade publicada
- [ ] Criar chave de publicação própria e guardar fora do repo (seção 0)
- [ ] Na Google Play, ao ativar a assinatura pelo Google, enviar esta mesma chave (opção "usar outra chave de assinatura"); senão o APK do GitHub e o da loja não atualizam um por cima do outro
- [ ] App Store: conta (US$ 99/ano), build no Mac, política de privacidade publicada
- [ ] Classificação etária, descrição sem promessa de saúde ("ajuda a comparar rótulos", nunca "cura" ou "emagrece")

## 7. Dinheiro
- [ ] Definir: anúncio no grátis + assinatura sem anúncio
- [ ] Nota fiscal/tributação da receita do app (ver com a contabilidade da Zicão)
