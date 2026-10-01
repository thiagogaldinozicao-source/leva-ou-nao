/* Sons e vibração do app, sem arquivo de áudio: tudo sintetizado com Web Audio (leve e funciona offline).
   Sons.bipe()  = leu o código de barras (bipe escolhido + vibração)
   Sons.toque() = toque em botão (clique fino e baixinho + vibração curta)
   Preferência em localStorage "som" = "mercado" | "gota" | "duplo" | "off" e "vibrar" = true/false.
   Vibração: Android = navigator.vibrate. iPhone (Safari não tem vibrate): o <input switch> do iOS 18+
   dá um "tic" de vibração quando é acionado, então aciona um escondido. iOS mais antigo: sem vibração. */
(() => {
  const ler = (k, padrao) => { try { const v = JSON.parse(localStorage.getItem(k)); return v === null ? padrao : v; } catch (e) { return padrao; } };
  const gravar = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };
  const TIPOS = ["mercado", "gota", "duplo", "off"];
  let tipo = TIPOS.includes(ler("som", "mercado")) ? ler("som", "mercado") : "mercado";
  let vibrar = ler("vibrar", true) !== false;

  // Web Audio: iPhone só libera o áudio depois de um toque do usuário, então cria/destrava no 1º toque.
  let ctx = null;
  const audio = () => {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    if (!ctx) ctx = new AC();
    if (ctx.state === "suspended") ctx.resume().catch(() => {});
    return ctx;
  };
  addEventListener("pointerdown", audio, { capture: true, passive: true });

  // Um "blip": onda, frequência (pode deslizar de f1 pra f2), volume, duração e atraso (segundos).
  function blip(c, { onda = "sine", f1, f2 = f1, vol, dur, em = 0, filtro = 0 }) {
    const t = c.currentTime + 0.005 + em, o = c.createOscillator(), g = c.createGain();
    o.type = onda;
    o.frequency.setValueAtTime(f1, t);
    if (f2 !== f1) o.frequency.exponentialRampToValueAtTime(f2, t + dur * 0.6);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.004);           // ataque rapidinho, sem estalo
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    let saida = o;
    if (filtro) { const lp = c.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = filtro; o.connect(lp); saida = lp; }
    saida.connect(g).connect(c.destination);
    o.start(t); o.stop(t + dur + 0.02);
  }

  const BIPES = {
    mercado: c => blip(c, { onda: "square", f1: 1850, vol: 0.09, dur: 0.13, filtro: 4200 }),   // caixa de mercado
    gota:    c => blip(c, { f1: 700, f2: 1500, vol: 0.22, dur: 0.12 }),                         // gotinha suave
    duplo:   c => { blip(c, { f1: 2100, vol: 0.16, dur: 0.06 }); blip(c, { f1: 2100, vol: 0.16, dur: 0.06, em: 0.09 }); },
  };

  // iPhone: switch escondido (fora da tela, fora do leitor de tela e do Tab).
  let rotulo = null;
  function ticIOS() {
    if (!rotulo) {
      rotulo = document.createElement("label");
      rotulo.setAttribute("aria-hidden", "true");
      rotulo.style.cssText = "position:fixed;left:-9999px;top:0;width:1px;height:1px;overflow:hidden;opacity:0;pointer-events:none";
      const i = document.createElement("input");
      i.type = "checkbox"; i.setAttribute("switch", ""); i.tabIndex = -1; i.dataset.semSom = "";
      rotulo.append(i); document.body.append(rotulo);
    }
    rotulo.click();
  }
  const vibra = ms => {
    if (!vibrar) return;
    if (navigator.vibrate) navigator.vibrate(ms);
    else if (/iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.maxTouchPoints > 1 && /Mac/.test(navigator.platform))) ticIOS();
  };

  function bipe() {
    vibra(60);
    if (tipo === "off") return;
    const c = audio(); if (c) BIPES[tipo](c);
  }
  function toque() {
    vibra(8);
    if (tipo === "off") return;
    const c = audio(); if (c) blip(c, { f1: 2600, vol: 0.035, dur: 0.025 });              // clique fino e baixinho
  }

  globalThis.Sons = {
    bipe, toque, TIPOS,
    get tipo() { return tipo; },
    set tipo(v) { if (TIPOS.includes(v)) { tipo = v; gravar("som", v); } },
    get vibrar() { return vibrar; },
    set vibrar(v) { vibrar = !!v; gravar("vibrar", vibrar); },
  };
})();
