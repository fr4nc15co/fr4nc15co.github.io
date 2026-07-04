// Eventos de GA4. No-op si GA no está activo: localhost sin `?ga` (el snippet
// del <head> no define window.gtag), gtag.js bloqueado por el navegador u
// offline. Con Consent Mode v2 los eventos se envían siempre; sin
// consentimiento van como pings anónimos sin cookies.
export function track(name, params = {}) {
  if (typeof window.gtag === "function") window.gtag("event", name, params);
}
