/* wa_logo.js — Sentire Command Center
   Replaces every 💬 (used only on WhatsApp buttons/labels in this app) with the
   recognisable green WhatsApp logo, everywhere, including content rendered later.
   Standalone: no dependencies. Safe — only touches text nodes that contain 💬. */
(function () {
  if (window.__waLogo) return; window.__waLogo = 1;
  var SVG = '<svg viewBox="0 0 32 32" width="1.05em" height="1.05em" aria-label="WhatsApp" ' +
    'style="vertical-align:-0.18em;display:inline-block">' +
    '<path fill="#25D366" d="M16 3C8.8 3 3 8.8 3 16c0 2.3.6 4.5 1.7 6.4L3 29l6.8-1.8A13 13 0 1 0 16 3z"/>' +
    '<path fill="#fff" d="M12.3 9.3c-.3-.6-.5-.6-.8-.6h-.7c-.2 0-.6.1-.9.4-.3.3-1.2 1.2-1.2 2.8 0 1.7 1.2 3.3 1.4 3.5.2.2 2.4 3.7 5.8 5.1 2.8 1.1 3.4.9 4 .8.6-.1 1.9-.8 2.2-1.5.3-.8.3-1.4.2-1.5-.1-.2-.3-.2-.6-.4l-2.2-1c-.3-.1-.5-.2-.7.2l-.8 1c-.1.2-.3.2-.6.1-.9-.4-1.8-.8-2.7-2-.7-1-.2-.9 0-1.3.1-.2.3-.4.4-.6.1-.2.1-.4 0-.6l-1.3-3z"/>' +
    '</svg>';
  function chip() { var s = document.createElement('span'); s.setAttribute('data-wa', '1'); s.style.display = 'inline-block'; s.innerHTML = SVG; return s; }
  function skip(p) {
    if (!p) return true;
    var t = p.nodeName;
    if (t === 'SCRIPT' || t === 'STYLE' || t === 'TEXTAREA' || t === 'INPUT' || t === 'OPTION' || t === 'TITLE') return true;
    if (p.closest && p.closest('[data-wa]')) return true;
    return false;
  }
  function run() {
    try {
      if (!document.body) return;
      var w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
        acceptNode: function (n) {
          if (!n.nodeValue || n.nodeValue.indexOf('💬') < 0) return NodeFilter.FILTER_REJECT;
          return skip(n.parentNode) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT;
        }
      });
      var list = [], n; while (n = w.nextNode()) list.push(n);
      list.forEach(function (node) {
        var parts = node.nodeValue.split('💬');
        var frag = document.createDocumentFragment();
        for (var i = 0; i < parts.length; i++) {
          if (i > 0) frag.appendChild(chip());
          if (parts[i]) frag.appendChild(document.createTextNode(parts[i]));
        }
        if (node.parentNode) node.parentNode.replaceChild(frag, node);
      });
    } catch (e) { /* never break the page over an icon */ }
  }
  var timer;
  function schedule() { clearTimeout(timer); timer = setTimeout(run, 60); }
  function start() {
    run();
    if (!document.body) { setTimeout(start, 100); return; }
    try { new MutationObserver(schedule).observe(document.body, { childList: true, subtree: true }); } catch (e) {}
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
