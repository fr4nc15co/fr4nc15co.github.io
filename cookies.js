/*
 * Banner de consentimiento de cookies (RGPD + LSSI-CE)
 * Compatible con Google Consent Mode v2 (ver snippet gtag en el <head>).
 * Autocontenido: inyecta sus propios estilos y no depende del CSS de la página.
 */
(function () {
  'use strict';

  var KEY = 'cookie-consent';            // 'granted' | 'denied'
  var PRIVACY_URL = '/privacidad.html';

  // Finalidad mostrada en el banner (personalizable por web con
  // data-purpose en la etiqueta <script src="/cookies.js" ...>)
  var DEFAULT_PURPOSE = 'y mejorar la web';
  function getPurpose() {
    var s = document.querySelector('script[src$="cookies.js"]');
    var p = s && s.getAttribute('data-purpose');
    return p && p.trim() ? p.trim() : DEFAULT_PURPOSE;
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
    div.setAttribute('aria-label', 'Aviso de cookies');
    div.innerHTML =
      '<div class="cc-inner">' +
        '<div class="cc-text">' +
          'Usamos cookies de <strong>Google Analytics</strong> para medir las visitas de forma anónima ' +
          getPurpose() + '. ' +
          'No se instalan hasta que las aceptas. ' +
          'Más información en la <a href="' + PRIVACY_URL + '">política de cookies</a>.' +
        '</div>' +
        '<div class="cc-actions">' +
          '<button id="cc-reject" type="button">Rechazar</button>' +
          '<button id="cc-accept" type="button">Aceptar</button>' +
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
