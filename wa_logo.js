/* wa_logo.js — Sentire Command Center shared icon swapper.
   Replaces app-wide, live (incl. content rendered later):
     💬  -> green WhatsApp logo   (WhatsApp buttons/labels)
     👁  -> eye icon with black pupil (View buttons)
   Standalone, no dependencies. Safe — only touches text nodes containing these glyphs. */
(function () {
  if (window.__iconSwap) return; window.__iconSwap = 1;

  var WA = '<svg viewBox="0 0 32 32" width="1.05em" height="1.05em" aria-label="WhatsApp" ' +
    'style="vertical-align:-0.18em;display:inline-block">' +
    '<path fill="#25D366" d="M16 3C8.8 3 3 8.8 3 16c0 2.3.6 4.5 1.7 6.4L3 29l6.8-1.8A13 13 0 1 0 16 3z"/>' +
    '<path fill="#fff" d="M12.3 9.3c-.3-.6-.5-.6-.8-.6h-.7c-.2 0-.6.1-.9.4-.3.3-1.2 1.2-1.2 2.8 0 1.7 1.2 3.3 1.4 3.5.2.2 2.4 3.7 5.8 5.1 2.8 1.1 3.4.9 4 .8.6-.1 1.9-.8 2.2-1.5.3-.8.3-1.4.2-1.5-.1-.2-.3-.2-.6-.4l-2.2-1c-.3-.1-.5-.2-.7.2l-.8 1c-.1.2-.3.2-.6.1-.9-.4-1.8-.8-2.7-2-.7-1-.2-.9 0-1.3.1-.2.3-.4.4-.6.1-.2.1-.4 0-.6l-1.3-3z"/></svg>';

  var EYE = '<svg viewBox="0 0 24 24" width="1.05em" height="1.05em" aria-label="View" ' +
    'style="vertical-align:-0.18em;display:inline-block">' +
    '<path d="M1 12S5 5 12 5s11 7 11 7-4 7-11 7S1 12 1 12z" fill="#ffffff" stroke="currentColor" stroke-width="1.6"/>' +
    '<circle cx="12" cy="12" r="3.4" fill="#111111"/>' +
    '<circle cx="13.2" cy="10.9" r="1" fill="#ffffff"/></svg>';

  // 💬 = U+1F4AC ; 👁 = U+1F441 (optionally followed by VS16 U+FE0F)
  var RE = /💬|👁️?/g;
  function svgFor(match) { return match.charCodeAt(1) === 0xDCAC ? WA : EYE; }

  function chip(match) {
    var s = document.createElement('span');
    s.setAttribute('data-ic', '1');
    s.style.display = 'inline-block';
    s.innerHTML = svgFor(match);
    return s;
  }
  function skip(p) {
    if (!p) return true;
    var t = p.nodeName;
    if (t === 'SCRIPT' || t === 'STYLE' || t === 'TEXTAREA' || t === 'INPUT' || t === 'OPTION' || t === 'TITLE') return true;
    if (p.closest && p.closest('[data-ic]')) return true;
    return false;
  }
  function run() {
    try {
      if (!document.body) return;
      var w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
        acceptNode: function (n) {
          RE.lastIndex = 0;
          if (!n.nodeValue || !RE.test(n.nodeValue)) return NodeFilter.FILTER_REJECT;
          return skip(n.parentNode) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT;
        }
      });
      var list = [], n; while (n = w.nextNode()) list.push(n);
      list.forEach(function (node) {
        var txt = node.nodeValue, frag = document.createDocumentFragment(), last = 0, m;
        RE.lastIndex = 0;
        while ((m = RE.exec(txt))) {
          if (m.index > last) frag.appendChild(document.createTextNode(txt.slice(last, m.index)));
          frag.appendChild(chip(m[0]));
          last = m.index + m[0].length;
        }
        if (last < txt.length) frag.appendChild(document.createTextNode(txt.slice(last)));
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
