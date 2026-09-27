# Leva ou não?

Tira foto do rótulo no mercado e o app diz se vale levar: **Pode levar**, **Com moderação** ou **Deixa na prateleira**. Também compara 2 produtos.

- Lê o texto da foto **no próprio celular** (Android: leitor do Google / ML Kit; navegador: Tesseract embutido)
- Regras: açúcar no começo da lista, % de açúcar adicionado, adoçantes, corantes artificiais, conservantes, gordura hidrogenada, soro de leite, % de suco, excesso de aditivos
- Nenhuma foto é salva. Funciona sem internet depois de instalado.

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
- `www/` — o app (HTML/CSS/JS), fontes, ícones e leitor web (`www/ocr`)
- `android/` — projeto nativo Android (Capacitor)
- `capacitor.config.json` — id do app: `br.com.zicao.levaounao`

## Rodar no navegador
```bash
npm run web
```
