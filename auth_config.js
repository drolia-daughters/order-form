// Sentire login — your Supabase project (see LOGIN_SETUP.txt).
// Both values are meant to be public: the "publishable" key only reaches what the database rules allow.
// NEVER put a key that starts with sb_secret_ in this file or anywhere in this folder.
// To switch the login off, empty both values (leave the quotes).
window.SENTIRE_SUPABASE_URL = 'https://phuducopbugeyvkzhvki.supabase.co';
window.SENTIRE_SUPABASE_KEY = 'sb_publishable_oNoK_iC6LC20hATuJ_EspA_2uyPdrJm';

// ---- Version shown on every page (change both lines when a new version goes live) ----
window.SENTIRE_VERSION = '1.20.0';
window.SENTIRE_BUILD   = '26 Nov 2026';
(function () {
  function show() {
    if (document.getElementById('stVer')) return;
    var v = 'v' + window.SENTIRE_VERSION, tip = 'Sentire Command Center ' + v + ' · ' + window.SENTIRE_BUILD;
    var b = document.querySelector('.brand span');
    if (b && !/ v\d/.test(b.textContent)) b.textContent += ' · ' + v;
    var d = document.createElement('div');
    d.id = 'stVer'; d.title = tip; d.textContent = 'Version ' + window.SENTIRE_VERSION;
    d.style.cssText = 'position:fixed;right:10px;bottom:8px;z-index:9999;font:600 11px/1 ui-monospace,Consolas,monospace;' +
      'padding:5px 9px;border-radius:999px;background:rgba(20,28,45,.85);color:#9fb3d1;border:1px solid rgba(120,150,200,.35);' +
      'pointer-events:none;letter-spacing:.3px';
    if (window.innerWidth < 760) d.style.bottom = '70px';
    document.body.appendChild(d);
    if (!/· v\d/.test(document.title)) document.title += ' · ' + v;
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', show); else show();
})();
