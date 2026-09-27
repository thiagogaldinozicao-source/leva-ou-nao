# Leva ou não?

Escaneia o código de barras no mercado e o app diz se vale levar: **Pode levar**, **Com moderação** ou **Deixa na prateleira**. Também compara 2 produtos.

- Lê o código de barras pela câmera (ZXing), ou por foto, ou digitando o número
- Busca o produto no **Open Food Facts** (base aberta e gratuita)
- Regras: classificação NOVA (ultraprocessado), açúcar adicionado, adoçantes, corantes artificiais, conservantes, gordura hidrogenada, soro de leite, % de suco, sal, excesso de aditivos
- Nenhuma foto é salva.

**Site:** https://thiagogaldinozicao-source.github.io/leva-ou-nao/

## Android (APK)
Todo push na `main` gera o APK sozinho.
Baixe em **Releases** (ou em Actions → última execução → Artifacts) e instale no celular.

## iPhone
Precisa de um Mac com Xcode:
```bash
npm install
npx cap add ios
npm run ios   # abre no Xcode → escolhe o iPhone → Run
```

## Estrutura
- `www/` — o app (HTML/CSS/JS), fontes, ícones e leitor de código de barras (`www/lib`)
- `android/` — projeto nativo Android (Capacitor)
- `capacitor.config.json` — id do app: `br.com.zicao.levaounao`

## Rodar no navegador
```bash
npm run web
```
