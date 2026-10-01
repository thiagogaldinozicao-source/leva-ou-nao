/* Sons e vibração do Leva ou não? Tudo sintetizado na hora (Web Audio: osciladores + ruído filtrado),
   sem arquivo de áudio: leve e funciona offline. Mesma linguagem da Cinemoteca.
   Respeita o silencioso do iPhone e não para a música (audioSession "ambient").
   Uso: Sons.<nome>() nos handlers. Todo som específico chama marca(): o "tic" genérico de clique
   (fim do arquivo) fica quieto se outro som tocou há < 120 ms. Elemento com [data-mudo] não faz tic.
   Ajustes (no ⓘ): Sons.som (liga/desliga), Sons.vibra (liga/desliga), Sons.bipeTipo ("mercado"|"gota"|"duplo"). */
(() => {
  // Personalidade: app de comida/mercado = macio e orgânico (seno/triângulo, sopro de papel), com o bipe de caixa como temático.
  const VOLUME = 0.5;   // volume geral do app: mexe só aqui
  const KEY = "sons";
  let cfg = { som: true, vibra: true, bipe: "mercado" };
  try {
    cfg = { ...cfg, ...JSON.parse(localStorage.getItem(KEY) || "{}") };
    // versão anterior guardava "som" = tipo do bipe ("off" = sem som) e "vibrar" à parte
    const velho = JSON.parse(localStorage.getItem("som")), vib = JSON.parse(localStorage.getItem("vibrar"));
    if (velho && !localStorage.getItem(KEY)) { if (velho === "off") cfg.som = false; else cfg.bipe = velho; if (vib === false) cfg.vibra = false; }
  } catch (e) { /* ignora */ }
  if (!["mercado", "gota", "duplo"].includes(cfg.bipe)) cfg.bipe = "mercado";
  const grava = () => { try { localStorage.setItem(KEY, JSON.stringify(cfg)); } catch (e) { /* ignora */ } };
  try { if (navigator.audioSession) navigator.audioSession.type = "ambient"; } catch (e) { /* ignora */ }

  let ctx = null, out = null, eco = null, ruido = null;
  function ac() {
    if (!cfg.som) return null;
    if (!ctx) {
      const C = window.AudioContext || window.webkitAudioContext;
      if (!C) return null;
      ctx = new C();
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -18; comp.ratio.value = 4;
      out = ctx.createGain(); out.gain.value = VOLUME;
      out.connect(comp); comp.connect(ctx.destination);
      // eco curto: só nos sons de "deu bom" (fx: true)
      const d = ctx.createDelay(); d.delayTime.value = 0.11;
      const fb = ctx.createGain(); fb.gain.value = 0.28;
      const lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 2600;
      eco = ctx.createGain(); eco.gain.value = 0.22;
      eco.connect(d); d.connect(lp); lp.connect(fb); fb.connect(d); lp.connect(out);
      const n = ctx.sampleRate * 0.5, b = ctx.createBuffer(1, n, ctx.sampleRate), ch = b.getChannelData(0);
      for (let i = 0; i < n; i++) ch[i] = Math.random() * 2 - 1;
      ruido = b;
    }
    if (ctx.state === "suspended") ctx.resume().catch(() => {});
    return ctx;
  }
  // iPhone só libera o áudio depois de um toque
  const destrava = () => { if (cfg.som) ac(); };
  addEventListener("pointerdown", destrava, { passive: true, capture: true });
  addEventListener("touchend", destrava, { passive: true, capture: true });
  // voltou do segundo plano: o iPhone suspende o áudio, retoma (só se já foi destravado por um toque)
  document.addEventListener("visibilitychange", () => { if (!document.hidden && ctx && ctx.state !== "running") ctx.resume().catch(() => {}); });

  let ultimo = 0;
  const marca = () => { ultimo = performance.now(); };

  // nota com envelope suave
  function tom(f, { t = 0, dur = 0.12, tipo = "sine", vol = 0.2, ate = null, fx = false, atk = 0.005, filtro = 0 } = {}) {
    const c = ac(); if (!c) return;
    const t0 = c.currentTime + t + 0.005;
    const o = c.createOscillator(), g = c.createGain();
    o.type = tipo; o.frequency.setValueAtTime(f, t0);
    if (ate) o.frequency.exponentialRampToValueAtTime(ate, t0 + dur * 0.9);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + atk);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    let s = o;
    if (filtro) { const lp = c.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = filtro; o.connect(lp); s = lp; }
    s.connect(g); g.connect(out); if (fx) g.connect(eco);
    o.start(t0); o.stop(t0 + dur + 0.05);
  }
  // sopro filtrado (abrir/fechar, passar)
  function sopro({ t = 0, dur = 0.2, de = 500, ate = 1800, vol = 0.05, q = 1.2 } = {}) {
    const c = ac(); if (!c) return;
    const t0 = c.currentTime + t + 0.005;
    const s = c.createBufferSource(); s.buffer = ruido;
    const f = c.createBiquadFilter(); f.type = "bandpass"; f.Q.value = q;
    f.frequency.setValueAtTime(de, t0); f.frequency.exponentialRampToValueAtTime(ate, t0 + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + dur * 0.35);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    s.connect(f); f.connect(g); g.connect(out);
    s.start(t0, Math.random() * 0.2); s.stop(t0 + dur + 0.05);
  }
  // estalinho (seletor, obturador)
  function estalo(t = 0, f = 3200, vol = 0.12) {
    const c = ac(); if (!c) return;
    const t0 = c.currentTime + t + 0.005;
    const s = c.createBufferSource(); s.buffer = ruido;
    const bp = c.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = f; bp.Q.value = 6;
    const g = c.createGain();
    g.gain.setValueAtTime(vol, t0); g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.035);
    s.connect(bp); bp.connect(g); g.connect(out);
    s.start(t0, Math.random() * 0.3); s.stop(t0 + 0.05);
  }

  // ---------- vibração ----------
  // Android: navigator.vibrate. iPhone (iOS 18+): acionar um <input switch> escondido dá o tique do sistema.
  let sw = null;
  function vib(n = 1) {
    if (!cfg.vibra) return;
    if (navigator.vibrate) { try { navigator.vibrate(n > 1 ? [14, 70, 14] : 14); } catch (e) {} return; }
    // iPhone: o truque só vale dentro do toque (fora dele o iOS ignora); sem userActivation = não tenta
    if (!navigator.userActivation || !navigator.userActivation.isActive) return;
    if (!sw) {
      const l = document.createElement("label");
      l.setAttribute("aria-hidden", "true"); l.dataset.mudo = "1";
      l.style.cssText = "position:fixed;left:-99px;top:0;width:1px;height:1px;opacity:0;pointer-events:none";
      const i = document.createElement("input"); i.type = "checkbox"; i.setAttribute("switch", ""); i.tabIndex = -1;
      l.appendChild(i); document.body.appendChild(l); sw = l;
    }
    sw.click();
    if (n > 1) setTimeout(() => sw && sw.click(), 90);
  }

  // ---------- o bipe do código de barras (escolhido no ⓘ) ----------
  const BIPES = {
    mercado: () => tom(1850, { tipo: "square", dur: 0.13, vol: 0.07, filtro: 4200 }),                 // caixa de mercado
    gota:    () => { tom(700, { dur: 0.12, vol: 0.18, ate: 1500 }); tom(2100, { t: 0.05, dur: 0.06, vol: 0.015 }); }, // gotinha
    duplo:   () => { tom(2093, { dur: 0.06, vol: 0.12 }); tom(2093, { t: 0.09, dur: 0.07, vol: 0.12 }); },        // bi-bip
  };

  const S = {
    // ---------- sistema ----------
    toque() { if (performance.now() - ultimo < 120) return; ultimo = performance.now() - 60; tom(1500, { dur: 0.03, vol: 0.045 }); tom(750, { dur: 0.025, vol: 0.03 }); },
    ok() { marca(); vib(); tom(880, { dur: 0.09, vol: 0.08 }); tom(1318.51, { t: 0.07, dur: 0.2, vol: 0.07, fx: true }); },
    erro() { marca(); vib(2); tom(233, { dur: 0.1, vol: 0.1, tipo: "triangle" }); tom(196, { t: 0.12, dur: 0.14, vol: 0.1, tipo: "triangle" }); },
    // não achou (produto sem cadastro, nada melhor): neutro, sem cara de erro
    nada() { marca(); tom(660, { dur: 0.09, vol: 0.06 }); tom(587.33, { t: 0.09, dur: 0.14, vol: 0.05 }); },

    // ---------- navegação e escolhas ----------
    selecao() { marca(); vib(); estalo(0, 4200, 0.06); tom(1200, { dur: 0.035, vol: 0.04 }); },              // abas Um/Comparar: roleta
    marcaChip(on) {                                                                                           // perfis: sobe liga, desce desliga
      marca(); vib();
      if (on) { tom(660, { dur: 0.06, vol: 0.09, ate: 990 }); tom(1980, { t: 0.04, dur: 0.08, vol: 0.02 }); }
      else tom(700, { dur: 0.07, vol: 0.06, ate: 460 });
    },
    chave(on) { marca(); vib(); estalo(0, on ? 3000 : 1800, 0.1); tom(on ? 880 : 520, { t: 0.02, dur: 0.06, vol: 0.05 }); }, // interruptores
    abre() { marca(); sopro({ dur: 0.22, de: 380, ate: 1700, vol: 0.045 }); },                                // folha/câmera abrindo
    fecha() { marca(); sopro({ dur: 0.17, de: 1500, ate: 420, vol: 0.03 }); },
    expande(on) { marca(); sopro(on ? { dur: 0.14, de: 600, ate: 1600, vol: 0.03 } : { dur: 0.12, de: 1400, ate: 600, vol: 0.022 }); }, // "como é avaliado", ingredientes
    entra() { marca(); sopro({ dur: 0.18, de: 500, ate: 1600, vol: 0.035 }); tom(784, { dur: 0.06, vol: 0.04, ate: 988 }); },   // abrir troca sugerida
    volta() { marca(); sopro({ dur: 0.16, de: 1500, ate: 500, vol: 0.03 }); tom(988, { dur: 0.06, vol: 0.035, ate: 740 }); },  // "Analisar outro"
    procura() { marca(); sopro({ dur: 0.3, de: 600, ate: 2000, vol: 0.03 }); sopro({ t: 0.18, dur: 0.3, de: 2000, ate: 600, vol: 0.025 }); }, // "Tem melhor?" buscando

    // ---------- temáticos ----------
    bipe() { marca(); vib(); BIPES[cfg.bipe](); },                                                             // leu o código
    foto() { marca(); vib(); estalo(0, 2200, 0.16); sopro({ t: 0.01, dur: 0.07, de: 3000, ate: 1500, vol: 0.06, q: 0.6 }); estalo(0.09, 1700, 0.12); }, // obturador
    tirar() { marca(); vib(); tom(440, { dur: 0.2, vol: 0.1, ate: 170, tipo: "triangle" }); sopro({ dur: 0.2, de: 1400, ate: 300, vol: 0.03 }); }, // × tirar produto
    apagaTudo() { marca(); vib(2); tom(330, { dur: 0.5, vol: 0.12, ate: 80, tipo: "triangle" }); sopro({ dur: 0.5, de: 2000, ate: 200, vol: 0.05 }); }, // limpar histórico

    // ---------- o veredito (o momento principal do app) ----------
    veredito(v) {
      marca();
      if (v === "comprar") {            // Pode levar: plim de 2 tons subindo, com brilho
        vib();
        tom(783.99, { dur: 0.32, vol: 0.13, fx: true }); tom(1174.66, { t: 0.085, dur: 0.45, vol: 0.12, fx: true }); tom(2349, { t: 0.085, dur: 0.2, vol: 0.02 });
      } else if (v === "moderacao") {   // Com moderação: dois tons parados, morno (nem festa nem bronca)
        vib();
        tom(659.25, { dur: 0.22, vol: 0.1, tipo: "triangle" }); tom(659.25, { t: 0.13, dur: 0.3, vol: 0.08, tipo: "triangle" });
      } else if (v === "evitar") {      // Deixa na prateleira: dois tons descendo, suave (não é erro do app)
        vib(2);
        tom(523.25, { dur: 0.2, vol: 0.11, tipo: "triangle" }); tom(392, { t: 0.14, dur: 0.34, vol: 0.1, tipo: "triangle", ate: 370 });
      } else {                          // remédio / só informação: virar página
        sopro({ dur: 0.16, de: 900, ate: 2400, vol: 0.03, q: 0.8 }); tom(1046.5, { t: 0.03, dur: 0.06, vol: 0.025 });
      }
    },
    vencedor(empate) {                  // Comparar: "Leva o A/B" = fanfarrinha curta; empate = neutro
      marca(); vib(2);
      if (empate) { tom(659.25, { dur: 0.2, vol: 0.09, tipo: "triangle" }); tom(659.25, { t: 0.12, dur: 0.28, vol: 0.08, tipo: "triangle" }); return; }
      [523.25, 659.25, 783.99].forEach((f, i) => tom(f, { t: i * 0.08, dur: 0.22, vol: 0.09, tipo: "triangle" }));
      [1046.5, 1318.51].forEach(f => tom(f, { t: 0.26, dur: 0.6, vol: 0.06, fx: true }));
    },

    // ---------- ajustes ----------
    get som() { return cfg.som; }, set som(v) { cfg.som = !!v; grava(); },
    get vibra() { return cfg.vibra; }, set vibra(v) { cfg.vibra = !!v; grava(); },
    get bipeTipo() { return cfg.bipe; }, set bipeTipo(v) { if (BIPES[v]) { cfg.bipe = v; grava(); } },
  };
  globalThis.Sons = S;

  // Clique em botão/link sem som próprio: "tic" baixinho. Espera o clique terminar (setTimeout 0) pra ver se
  // um som específico tocou (inclusive o "change" que o <label> dispara no <input> logo depois).
  document.addEventListener("click", e => {
    const el = e.target.closest && e.target.closest("button, a, label, summary, [role=tab]");
    if (!el || el.closest("[data-mudo]") || el.disabled || el.matches("summary")) return;
    setTimeout(() => S.toque(), 0);
  });
})();
