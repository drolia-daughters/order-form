// ═══════════════════════════════════════════════════════════════
//  SENTIRE LIVE SYNC — included after auth.js on every app page.
//  Keeps the business data (orders, clients, jobs, stock ...) in Supabase so every user on every
//  workstation sees the same data. The apps still read and write the browser's own storage as before;
//  this file copies changes to the database, brings other people's changes in, and refreshes the screen.
//  Needs supabase_update_3_sync.sql (see LOGIN_SETUP.txt). Without it the apps simply work per browser.
// ═══════════════════════════════════════════════════════════════
(function () {
  var A = window.SentireAuth;
  if (!A || !A.enabled || !A.client) return;
  var page = (location.pathname.split('/').pop() || 'index.html');
  if (page === 'login.html' || page === 'users.html' || page === 'hub.html') return;

  // Which browser-storage names are shared business data (everything else stays on this computer).
  var SHARED = /^(ordersheet_|prod_|fin_|st_|inv_|crm_|jw_(?!admin_until)|lc_batches$|stmt_)/;
  var META = 'sentire_sync_meta';
  var nGet = Storage.prototype.getItem, nSet = Storage.prototype.setItem;
  var applying = false, ready = false;
  var meta = { v: {}, h: {} };                    // v: last version synced per key, h: fingerprint of what was synced
  var base = {};                                  // last synced value per key (in memory)
  var pending = {}, timer = null, pushing = false, retry = null;

  try { var m0 = JSON.parse(nGet.call(localStorage, META) || 'null'); if (m0 && m0.v && m0.h) meta = m0; } catch (e) {}
  function saveMeta() { try { nSet.call(localStorage, META, JSON.stringify(meta)); } catch (e) {} }

  // ── helpers ────────────────────────────────────────────────────
  function canon(x) {                             // JSON text with sorted keys, so the same data always looks the same
    if (x === null || typeof x !== 'object') return JSON.stringify(x === undefined ? null : x);
    if (Array.isArray(x)) return '[' + x.map(canon).join(',') + ']';
    return '{' + Object.keys(x).sort().map(function (k) { return JSON.stringify(k) + ':' + canon(x[k]); }).join(',') + '}';
  }
  function hash(s) { var h = 5381, i = s.length; while (i) h = (h * 33) ^ s.charCodeAt(--i); return (h >>> 0).toString(36) + ':' + s.length; }
  function readLocal(k) { try { var t = nGet.call(localStorage, k); return t == null ? undefined : JSON.parse(t); } catch (e) { return undefined; } }
  function writeLocal(k, v) { applying = true; try { nSet.call(localStorage, k, JSON.stringify(v)); } finally { applying = false; } }
  function fp(v) { return hash(canon(v)); }
  function isObj(x) { return x && typeof x === 'object' && !Array.isArray(x); }
  function idOf(x) {
    if (isObj(x)) {
      if (x.id != null) return 'i' + x.id; if (x.orderNo != null) return 'o' + x.orderNo; if (x.jobNo != null) return 'j' + x.jobNo;
      if (x.code != null) return 'c' + x.code; return 'h' + canon(x);
    }
    return 'p' + canon(x);
  }
  function byId(arr) { var m = {}; (arr || []).forEach(function (x) { m[idOf(x)] = x; }); return m; }

  // Three-way merge: base = what both started from, mine = this computer, theirs = the database.
  // base may be undefined (then everything that only exists on one side is simply kept).
  function merge(b, mine, theirs) {
    if (Array.isArray(mine) && Array.isArray(theirs)) {
      var hasB = Array.isArray(b), bm = byId(hasB ? b : []), lm = byId(mine), rm = byId(theirs), out = [];
      theirs.forEach(function (r) {
        var id = idOf(r), l = lm[id], bb = bm[id];
        if (l === undefined) {                    // not on this computer
          if (hasB && bb !== undefined) { if (canon(bb) !== canon(r)) out.push(r); }   // I deleted it (unless they changed it)
          else out.push(r);                       // new from them
        } else if (bb !== undefined) {
          var lc = canon(l) !== canon(bb), rc = canon(r) !== canon(bb);
          out.push(lc && rc ? merge(bb, l, r) : (lc ? l : r));
        } else out.push(canon(l) === canon(r) ? r : merge(undefined, l, r));
      });
      mine.forEach(function (l) {
        var id = idOf(l);
        if (rm[id] !== undefined) return;
        if (hasB && bm[id] !== undefined) { if (canon(l) !== canon(bm[id])) out.push(l); }   // they deleted it (unless I changed it)
        else out.push(l);                         // new from me
      });
      return out;
    }
    if (isObj(mine) && isObj(theirs)) {
      var bo = isObj(b) ? b : null, o = {}, keys = {};
      Object.keys(theirs).forEach(function (k) { keys[k] = 1; }); Object.keys(mine).forEach(function (k) { keys[k] = 1; });
      Object.keys(keys).forEach(function (k) {
        var inL = k in mine, inR = k in theirs, inB = bo && k in bo;
        if (inL && inR) {
          if (canon(mine[k]) === canon(theirs[k])) o[k] = theirs[k];
          else if (inB) { var lc = canon(mine[k]) !== canon(bo[k]), rc = canon(theirs[k]) !== canon(bo[k]); o[k] = lc && rc ? merge(bo[k], mine[k], theirs[k]) : (lc ? mine[k] : theirs[k]); }
          else o[k] = merge(undefined, mine[k], theirs[k]);
        } else if (inL) { if (!(inB && canon(mine[k]) === canon(bo[k]))) o[k] = mine[k]; }       // theirs deleted it unless I changed it
        else { if (!(inB && canon(theirs[k]) === canon(bo[k]))) o[k] = theirs[k]; }
      });
      return o;
    }
    if (b !== undefined && canon(mine) === canon(b)) return theirs;
    return (b === undefined) ? theirs : mine;      // plain values: what this computer changed wins; with no base the database wins
  }

  // ── cover the page until the latest data is in ─────────────────
  var cover = document.createElement('style');
  cover.textContent = 'html::before{content:"Loading the latest data…";position:fixed;inset:0;z-index:2147483646;background:#0c0f14;color:#7a8599;font:14px sans-serif;display:flex;align-items:center;justify-content:center;}';
  (document.head || document.documentElement).appendChild(cover);
  function uncover() { if (cover.parentNode) cover.parentNode.removeChild(cover); }
  setTimeout(uncover, 9000);

  // ── push local changes to the database ─────────────────────────
  function queue(k) { pending[k] = 1; if (!ready) return; clearTimeout(timer); timer = setTimeout(flush, 300); }
  function flush() {
    if (pushing || !ready) return; var keys = Object.keys(pending); if (!keys.length) return;
    pushing = true;
    keys.reduce(function (p, k) { return p.then(function () { delete pending[k]; return pushKey(k); }); }, Promise.resolve())
      .catch(function () {}).then(function () { pushing = false; if (Object.keys(pending).length) timer = setTimeout(flush, 500); });
  }
  function pushKey(k, n) {
    n = n || 0; var local = readLocal(k); if (local === undefined) return Promise.resolve();
    if (base[k] !== undefined && canon(local) === canon(base[k]) && meta.v[k]) return Promise.resolve();
    return A.client.rpc('kv_put', { p_key: k, p_value: local, p_base: meta.v[k] || 0 }).then(function (r) {
      if (r.error) {
        var msg = r.error.message || '';
        if (/can delete/i.test(msg)) { tellDeny(k); return; }
        pending[k] = 1; scheduleRetry(); return;     // network or other trouble: keep it and try again
      }
      var d = r.data;
      if (d && d.ok) { meta.v[k] = d.version; meta.h[k] = fp(local); base[k] = local; saveMeta(); return; }
      if (d && n < 5) {                           // someone saved first: merge their version with mine and try again
        var merged = merge(base[k], local, d.value); writeLocal(k, merged);
        base[k] = d.value; meta.v[k] = d.version; saveMeta(); changed([k]);
        return pushKey(k, n + 1);
      }
    }, function () { pending[k] = 1; scheduleRetry(); });
  }
  function scheduleRetry() { if (!retry) retry = setTimeout(function () { retry = null; flush(); }, 15000); }
  function tellDeny(k) {                          // a non-admin tried to delete: put the real data back
    A.client.from('kv_store').select('value,version').eq('key', k).single().then(function (r) {
      if (r.data) { writeLocal(k, r.data.value); base[k] = r.data.value; meta.v[k] = r.data.version; meta.h[k] = fp(r.data.value); saveMeta(); }
      banner('Only the Admin or Sub Admin can delete. Your change was undone.', true); setTimeout(function () { location.reload(); }, 1500);
    });
  }

  // ── bring other people's changes in ────────────────────────────
  function takeRemote(k, remote, ver) {           // returns true when this computer's copy changed
    var local = readLocal(k), cleanLocal = local === undefined || (meta.h[k] && fp(local) === meta.h[k]);
    var result = remote, mustPush = false;
    if (!cleanLocal) { result = merge(base[k], local, remote); mustPush = canon(result) !== canon(remote); }
    var diff = local === undefined || canon(result) !== canon(local);
    if (diff) writeLocal(k, result);
    base[k] = remote; meta.v[k] = ver; meta.h[k] = mustPush ? (meta.h[k] || '') : fp(result); saveMeta();
    if (mustPush) { pending[k] = 1; }
    return diff;
  }
  function checkVersions(first) {
    return A.client.from('kv_store').select('key,version').then(function (r) {
      if (r.error) throw r.error;
      var need = [];
      (r.data || []).forEach(function (row) {
        if (!SHARED.test(row.key)) return;
        var local = readLocal(row.key), same = meta.v[row.key] === row.version && base[row.key] !== undefined;
        var knownClean = meta.v[row.key] === row.version && local !== undefined && meta.h[row.key] && fp(local) === meta.h[row.key];
        if (!same && !knownClean) need.push(row.key);
        else if (knownClean && base[row.key] === undefined) base[row.key] = local;
      });
      if (!need.length) return [];
      return A.client.from('kv_store').select('key,value,version').in('key', need).then(function (r2) {
        if (r2.error) throw r2.error;
        var ch = []; (r2.data || []).forEach(function (row) { if (takeRemote(row.key, row.value, row.version)) ch.push(row.key); });
        return ch;
      });
    });
  }

  // ── show new data on screen ────────────────────────────────────
  var bar = null, waiting = false, lastKey = Date.now();
  document.addEventListener('keydown', function () { lastKey = Date.now(); }, true);
  function banner(text, bad) {
    if (!bar) { bar = document.createElement('div'); bar.style.cssText = 'position:fixed;left:50%;transform:translateX(-50%);bottom:16px;z-index:2147483000;padding:9px 16px;border-radius:8px;font:13px sans-serif;color:#fff;box-shadow:0 4px 20px rgba(0,0,0,.4);'; (document.body || document.documentElement).appendChild(bar); }
    bar.style.background = bad ? '#b91c1c' : '#2563eb'; bar.textContent = text; bar.style.display = 'block';
    clearTimeout(bar._t); bar._t = setTimeout(function () { bar.style.display = 'none'; }, bad ? 6000 : 3500);
  }
  function busy() {
    var a = document.activeElement, t = a && a.tagName;
    if (t === 'INPUT' || t === 'TEXTAREA' || t === 'SELECT' || (a && a.isContentEditable)) return true;
    if (document.querySelector('.st-ov,[class*="modal"].open,[class*="overlay"].open,.ov.open,dialog[open]')) return true;
    return Date.now() - lastKey < 3000;
  }
  function changed(keys) {
    if (!keys || !keys.length) return;
    try { document.dispatchEvent(new CustomEvent('st-sync', { detail: { keys: keys } })); } catch (e) {}
    if (typeof window.sentireRefresh === 'function') { try { window.sentireRefresh(keys); } catch (e) {} return; }
    softReload();
  }
  function softReload() {
    if (waiting) return; waiting = true; banner('🔄 New data from another user — updating…');
    (function tick() { if (busy()) { setTimeout(tick, 2500); return; } location.reload(); })();
  }

  // ── Admin-only delete: hide the buttons, and block the functions, for everyone else ──
  var APV = ['approveOrder', 'approveLaser', 'approvePacking', 'approveBill'];
  var DEL = ['cancelOrder', 'deletePartyName', 'deleteSavedLogo', 'delMove', 'delParty', 'deleteCompetitor', 'deleteLead', 'delEntry', 'delAppr', 'delHol', 'delBOM', 'delBatch', 'delRem'];
  function lockList(list, allowed, text) {
    if (allowed) return;
    var css = document.createElement('style');
    css.textContent = list.map(function (f) { return '[onclick^="' + f + '("]'; }).join(',') + '{display:none !important;}';
    (document.head || document.documentElement).appendChild(css);
    list.forEach(function (f) { if (typeof window[f] === 'function') window[f] = function () { alert(text); }; });
  }
  function lockDeletes() {
    lockList(DEL, A.canDelete(), 'Only the Admin or Sub Admin can delete.');
    lockList(APV, A.canApprove(), 'Only the Admin, Sub Admin or an approver can approve.');
  }
  A.ready.then(function () { if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', lockDeletes); else lockDeletes(); });

  // ── watch the shared storage writes made by the apps ───────────
  Storage.prototype.setItem = function (k, v) {
    nSet.apply(this, arguments);
    if (this === localStorage && !applying && SHARED.test(String(k))) queue(String(k));
  };

  // ── start ──────────────────────────────────────────────────────
  var started = false;
  function start(me) {
    for (var i = 0; i < localStorage.length; i++) { var k = localStorage.key(i); if (SHARED.test(k) && !meta.h[k]) pending[k] = 1; }
    return checkVersions(true).then(function (ch) {
      ready = true; started = true; flush();
      var key = 'sx_rl_' + page, last = +(sessionStorage.getItem(key) || 0);
      if (ch.length && Date.now() - last > 15000) { sessionStorage.setItem(key, String(Date.now())); location.reload(); return; }
      uncover();
      // live updates: the database tells us at once; we also look every 15 seconds and when the window comes back
      var go = (function () { var t; return function () { clearTimeout(t); t = setTimeout(function () { checkVersions().then(function (c) { flush(); changed(c); }).catch(function () {}); }, 250); }; })();
      try { A.client.channel('sx-kv').on('postgres_changes', { event: '*', schema: 'public', table: 'kv_store' }, go).subscribe(); } catch (e) {}
      setInterval(go, 15000);
      document.addEventListener('visibilitychange', function () { if (!document.hidden) go(); });
      window.addEventListener('online', function () { go(); flush(); });
    }).catch(function () {                         // no internet, or update 3 not run yet: work on this computer and try again later
      uncover(); if (!started) setTimeout(function () { start(me); }, 30000);
    });
  }
  A.ready.then(function (me) { if (!me) { uncover(); return; } return start(me); }).catch(function () { uncover(); });

  window.SentireSync = { flush: flush, check: function () { return checkVersions().then(function (c) { flush(); changed(c); }); } };
})();
