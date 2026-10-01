"""Gera os ícones do Leva ou não? a partir de um único desenho em SVG.

Uso: python3 tools/icone/gerar.py   (precisa de: pip install resvg-py pillow)
Saída: www/icons/*.png, www/favicon.svg e assets/icon-1024.png.
Mudou o desenho? Rode de novo e suba a VERSAO do www/sw.js.
"""
import io, pathlib
import resvg_py
from PIL import Image

RAIZ = pathlib.Path(__file__).resolve().parents[2]
ICONS = RAIZ / "www" / "icons"

# Cores do app (www/index.html :root): preto, ouro, ouro-l, branco.
DEFS = """
<defs>
  <linearGradient id="fundo" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#262626"/><stop offset="1" stop-color="#000"/>
  </linearGradient>
  <radialGradient id="aura" cx="0.5" cy="0.52" r="0.5">
    <stop offset="0" stop-color="#EBB533" stop-opacity=".22"/><stop offset="1" stop-color="#EBB533" stop-opacity="0"/>
  </radialGradient>
  <linearGradient id="ouro" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#F4CB63"/><stop offset=".55" stop-color="#EBB533"/><stop offset="1" stop-color="#C98F1A"/>
  </linearGradient>
  <linearGradient id="brilho" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#fff" stop-opacity=".45"/><stop offset="1" stop-color="#fff" stop-opacity="0"/>
  </linearGradient>
  <filter id="sombra" x="-20%" y="-20%" width="140%" height="150%">
    <feDropShadow dx="0" dy="18" stdDeviation="22" flood-color="#000" flood-opacity=".55"/>
  </filter>
  <filter id="sombra2" x="-30%" y="-30%" width="160%" height="170%">
    <feDropShadow dx="0" dy="8" stdDeviation="10" flood-color="#7a5200" flood-opacity=".55"/>
  </filter>
  <clipPath id="cesta"><path d="M300 365 H842 L772 632 H368 Z"/></clipPath>
</defs>"""

# Carrinho cheio (cesta preenchida em vez de só contorno: lê melhor a 32px) + check branco.
CARRINHO = """
<g filter="url(#sombra)">
  <path d="M198 282 H262 L318 372" fill="none" stroke="url(#ouro)" stroke-width="58" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M300 365 H842 L772 632 H368 Z" fill="url(#ouro)" stroke="url(#ouro)" stroke-width="56" stroke-linejoin="round"/>
  <path d="M272 340 H870 L860 420 H290 Z" fill="url(#brilho)" clip-path="url(#cesta)" opacity=".9"/>
  <circle cx="430" cy="768" r="60" fill="url(#ouro)"/>
  <circle cx="712" cy="768" r="60" fill="url(#ouro)"/>
  <circle cx="414" cy="750" r="20" fill="#fff" opacity=".35"/>
  <circle cx="696" cy="750" r="20" fill="#fff" opacity=".35"/>
</g>
<path d="M468 500 L548 576 L694 432" fill="none" stroke="#fff" stroke-width="74" stroke-linecap="round" stroke-linejoin="round" filter="url(#sombra2)"/>
"""
# Centro visual do carrinho (x 169–898, y 253–828) -> centro do quadro 512,512.
CENTRO = (533, 540)


def svg(escala=1.0, raio=0, fundo=True):
    cx, cy = CENTRO
    t = f"translate(512 512) scale({escala}) translate({-cx} {-cy})"
    clip = f'<clipPath id="canto"><rect width="1024" height="1024" rx="{raio}"/></clipPath>' if raio else ""
    corpo = (
        f'<rect width="1024" height="1024" fill="url(#fundo)"/><rect width="1024" height="1024" fill="url(#aura)"/>'
        if fundo else ""
    ) + f'<g transform="{t}">{CARRINHO}</g>'
    if raio:
        corpo = f'<g clip-path="url(#canto)">{corpo}</g>'
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024">'
            f'{DEFS.replace("</defs>", clip + "</defs>")}{corpo}</svg>')


def png(markup, lado, opaco=True):
    img = Image.open(io.BytesIO(resvg_py.svg_to_bytes(svg_string=markup, width=lado, height=lado)))
    img = img.convert("RGBA")
    if opaco:  # iPhone/App Store: sem canal alfa
        base = Image.new("RGB", img.size, "#000")
        base.paste(img, mask=img.split()[3])
        img = base
    return img


if __name__ == "__main__":
    cheio = svg(1.06)                # ícone de tela inicial: carrinho grande
    mascara = svg(0.80)              # maskable: tudo dentro do círculo de 80%
    redondo = svg(1.14, raio=225)     # favicon: cantos arredondados (≈22%)

    (ICONS / "icon.svg").write_text(cheio)
    (RAIZ / "www" / "favicon.svg").write_text(redondo)
    png(cheio, 180).save(ICONS / "apple-touch-icon.png", optimize=True)
    png(cheio, 192).save(ICONS / "icon-192.png", optimize=True)
    png(cheio, 512).save(ICONS / "icon-512.png", optimize=True)
    png(mascara, 512).save(ICONS / "icon-maskable-512.png", optimize=True)
    png(redondo, 32, opaco=False).save(ICONS / "favicon-32.png", optimize=True)
    png(cheio, 1024).save(ICONS / "icon-only.png", optimize=True)
    png(cheio, 1024).save(RAIZ / "assets" / "icon-1024.png", optimize=True)  # fonte do APK (Capacitor)
    print("ok")
