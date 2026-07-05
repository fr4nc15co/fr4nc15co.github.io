/*
 * Banner de consentimiento de cookies (RGPD + LSSI-CE)
 * Compatible con Google Consent Mode v2 (ver snippet gtag en el <head>).
 * Autocontenido: inyecta sus propios estilos y no depende del CSS de la página.
 */
(function () {
  'use strict';

  var KEY = 'cookie-consent';            // 'granted' | 'denied'
  var PRIVACY_URL = '/privacidad.html';

  // Idioma del banner según <html lang> ('es' por defecto).
  function getLang() {
    var l = (document.documentElement.getAttribute('lang') || 'es').toLowerCase();
    return l.indexOf('en') === 0 ? 'en' : 'es';
  }

  // Textos del banner en ES/EN.
  var STRINGS = {
    es: {
      aria: 'Aviso de cookies',
      intro: 'Usamos cookies de <strong>Google Analytics</strong> para medir las visitas de forma anónima ',
      purpose: 'y mejorar la web',
      tail: '. No se instalan hasta que las aceptas. Más información en la ',
      link: 'política de cookies',
      reject: 'Rechazar',
      accept: 'Aceptar'
    },
    en: {
      aria: 'Cookie notice',
      intro: 'We use <strong>Google Analytics</strong> cookies to measure visits anonymously ',
      purpose: 'and improve the site',
      tail: '. They are not installed until you accept. More information in our ',
      link: 'cookie policy',
      reject: 'Decline',
      accept: 'Accept'
    }
  };

  // Finalidad personalizable por web con data-purpose (es) y data-purpose-en (en)
  // en la etiqueta <script src="/cookies.js" ...>.
  function getPurpose(lang) {
    var s = document.querySelector('script[src$="cookies.js"]');
    var attr = lang === 'en' ? 'data-purpose-en' : 'data-purpose';
    var p = s && s.getAttribute(attr);
    return p && p.trim() ? p.trim() : STRINGS[lang].purpose;
  }

  function gtag() {
    window.dataLayer = window.dataLayer || [];
    window.dataLayer.push(arguments);
  }

  function getChoice() {
    try { return localStorage.getItem(KEY); } catch (e) { return null; }
  }

  function save(value) {
    try { localStorage.setItem(KEY, value); } catch (e) {}
  }

  function grantAnalytics() {
    gtag('consent', 'update', { 'analytics_storage': 'granted' });
  }

  function injectStyles() {
    if (document.getElementById('cc-styles')) return;
    var css =
      '#cc-banner{position:fixed;left:0;right:0;bottom:0;z-index:2147483647;' +
      'background:#1a1f2e;color:#e0e0e0;border-top:1px solid #34495e;' +
      'box-shadow:0 -4px 20px rgba(0,0,0,.35);' +
      "font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;" +
      'font-size:14px;line-height:1.5;animation:cc-up .25s ease-out}' +
      '@keyframes cc-up{from{transform:translateY(100%)}to{transform:translateY(0)}}' +
      '#cc-banner .cc-inner{max-width:1000px;margin:0 auto;padding:16px 20px;' +
      'display:flex;flex-wrap:wrap;align-items:center;gap:12px 20px;justify-content:space-between}' +
      '#cc-banner .cc-text{flex:1 1 320px;min-width:260px}' +
      '#cc-banner a{color:#5dade2;text-decoration:underline}' +
      '#cc-banner .cc-actions{display:flex;gap:10px;flex-wrap:wrap}' +
      '#cc-banner button{cursor:pointer;border:0;border-radius:6px;padding:10px 18px;' +
      'font-size:14px;font-weight:600;font-family:inherit}' +
      '#cc-reject{background:transparent;color:#e0e0e0;border:1px solid #5a6b80}' +
      '#cc-reject:hover{background:#2a3142}' +
      '#cc-accept{background:#5dade2;color:#0d1320}' +
      '#cc-accept:hover{background:#7fc1e8}' +
      '@media(max-width:560px){#cc-banner .cc-actions{width:100%}' +
      '#cc-banner button{flex:1}}';
    var s = document.createElement('style');
    s.id = 'cc-styles';
    s.textContent = css;
    document.head.appendChild(s);
  }

  function removeBanner() {
    var b = document.getElementById('cc-banner');
    if (b && b.parentNode) b.parentNode.removeChild(b);
  }

  function showBanner() {
    injectStyles();
    if (document.getElementById('cc-banner')) return;
    var div = document.createElement('div');
    div.id = 'cc-banner';
    div.setAttribute('role', 'dialog');
    div.setAttribute('aria-live', 'polite');
    var t = STRINGS[getLang()];
    div.setAttribute('aria-label', t.aria);
    div.innerHTML =
      '<div class="cc-inner">' +
        '<div class="cc-text">' +
          t.intro + getPurpose(getLang()) + t.tail +
          '<a href="' + PRIVACY_URL + '">' + t.link + '</a>.' +
        '</div>' +
        '<div class="cc-actions">' +
          '<button id="cc-reject" type="button">' + t.reject + '</button>' +
          '<button id="cc-accept" type="button">' + t.accept + '</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(div);

    div.querySelector('#cc-accept').addEventListener('click', function () {
      save('granted');
      grantAnalytics();
      removeBanner();
    });
    div.querySelector('#cc-reject').addEventListener('click', function () {
      save('denied');
      removeBanner();
    });
  }

  // Permite reabrir el panel desde cualquier enlace: onclick="openCookieSettings()"
  window.openCookieSettings = function () {
    try { localStorage.removeItem(KEY); } catch (e) {}
    removeBanner();
    showBanner();
  };

  function init() {
    if (!getChoice()) showBanner();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
