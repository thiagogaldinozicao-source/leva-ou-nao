// Liga o modo offline (sw.js) só no site. No app Android/iOS os arquivos já vêm no pacote: não registra.
(() => {
  if (window.Capacitor?.isNativePlatform?.()) return;
  if (!("serviceWorker" in navigator) || !window.isSecureContext) return;
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js", { updateViaCache: "none" }).catch(() => {});
  });
})();
