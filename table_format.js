// Sentire Command Center — one table format everywhere (1.19.0, 26 Nov 2026)
// In every table of every screen:
//   1. the CLIENT / party / customer / supplier / vendor / company name is the FIRST column
//      (only a tick box or # column may stay in front of it),
//   2. the Actions buttons are the LAST column, kept visible on the right while scrolling.
// Works on tables drawn later too (it watches the page), so new screens follow the same rule.
// A table can opt out with data-tf="off". The order-entry item table and stock item lists are left as they are.
(function () {
  if (window.__sentireTF) return; window.__sentireTF = 1;
  var CLIENT = /^(party|client|customer|company|supplier|vendor)( name)?$/;
  var ACTION = /^actions?$/;
  function txt(th) { return String(th.textContent || '').replace(/[^\w\s#\/]/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase(); }
  function lead(th) { var t = txt(th); return t === '' || t === '#' || !!th.querySelector('input[type=checkbox]'); }
  function skip(tb) {
    if (tb.dataset.tf === 'off' || tb.classList.contains('items-tbl')) return true;
    var h = tb.tHead && tb.tHead.textContent || '';
    return /Item Code|Item Name/.test(h);          // stock item lists: the item stays first
  }
  function headRow(tb) { var h = tb.tHead; return h && h.rows.length ? h.rows[h.rows.length - 1] : null; }
  function permFor(ths) {
    var n = ths.length, c = -1, a = -1, i;
    for (i = 0; i < n; i++) { var t = txt(ths[i]); if (c < 0 && CLIENT.test(t)) c = i; if (a < 0 && ACTION.test(t)) a = i; }
    if (c < 0 && a < 0) return null;
    var keep = 0; while (keep < n && keep !== c && keep !== a && lead(ths[keep])) keep++;
    var p = []; for (i = 0; i < keep; i++) p.push(i);
    if (c >= 0) p.push(c);
    for (i = keep; i < n; i++) if (i !== c && i !== a) p.push(i);
    if (a >= 0) p.push(a);
    for (i = 0; i < n; i++) if (p[i] !== i) return p;
    return null;                                    // already in the right order
  }
  function apply(row, p, actAt) {
    var cells = row.cells; if (cells.length !== p.length) return;
    for (var i = 0; i < cells.length; i++) if (cells[i].colSpan > 1) return;
    var arr = []; for (i = 0; i < cells.length; i++) arr.push(cells[i]);
    p.forEach(function (k) { row.appendChild(arr[k]); });
    if (actAt >= 0) row.cells[actAt].classList.add('tf-act');
  }
  function fix(tb) {
    if (skip(tb)) return;
    var hr = headRow(tb); if (!hr) return;
    var sig = [].map.call(hr.cells, txt).join('|');
    if (hr._tfSig !== sig) {                        // header (re)drawn: work out the order from the original columns
      var p = permFor([].slice.call(hr.cells)); tb._tf = p;
      tb._tfAct = -1;
      if (p) { var a = -1; for (var j = 0; j < hr.cells.length; j++) if (ACTION.test(txt(hr.cells[j]))) a = j; tb._tfAct = a >= 0 ? p.length - 1 : -1; apply(hr, p, tb._tfAct); }
      hr._tfSig = [].map.call(hr.cells, txt).join('|');
    }
    var perm = tb._tf; if (!perm) return;
    [].forEach.call(tb.tBodies, function (b) {
      [].forEach.call(b.rows, function (r) { if (r.dataset.tf === '1') return; r.dataset.tf = '1'; apply(r, perm, tb._tfAct); });
    });
    if (tb.tFoot) [].forEach.call(tb.tFoot.rows, function (r) { if (r.dataset.tf === '1') return; r.dataset.tf = '1'; apply(r, perm, tb._tfAct); });
  }
  var queued = false;
  function run() { queued = false; [].forEach.call(document.querySelectorAll('table'), function (t) { try { fix(t); } catch (e) {} }); }
  function soon() { if (!queued) { queued = true; (window.requestAnimationFrame || setTimeout)(run); } }
  function css() {
    var s = document.createElement('style');
    s.textContent = 'th.tf-act,td.tf-act{position:sticky;right:0;z-index:1;background:var(--surface,#141820);box-shadow:-6px 0 8px -6px rgba(0,0,0,.6);}';
    document.head.appendChild(s);
  }
  function start() {
    css(); run();
    new MutationObserver(function (ms) {
      for (var i = 0; i < ms.length; i++) { var m = ms[i]; if (m.addedNodes.length) { soon(); return; } }
    }).observe(document.body, { childList: true, subtree: true });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
