// ═══════════════════════════════════════════════════════════════
//  SENTIRE LOGIN GATE — included at the top of every page (after the Supabase library).
//  Nobody logged in on this device → sends the person to login.html.
//  Logins live in Supabase (supabase_setup.sql); see LOGIN_SETUP.txt.
// ═══════════════════════════════════════════════════════════════
(function () {
  var URL_ = (window.SENTIRE_SUPABASE_URL || '').trim(), KEY = (window.SENTIRE_SUPABASE_KEY || '').trim();
  var MK = 'sentire_user';                       // remembers who is logged in, so pages open without a wait
  var page = (location.pathname.split('/').pop() || 'index.html');
  var isLogin = page === 'login.html';

  function cached() { try { var u = JSON.parse(localStorage.getItem(MK) || 'null'); return u && u.login_id ? u : null; } catch (e) { return null; } }
  function remember(u) { localStorage.setItem(MK, JSON.stringify(u)); }
  function forget() { localStorage.removeItem(MK); }
  function hide() { document.documentElement.style.visibility = 'hidden'; }
  function show() { document.documentElement.style.visibility = ''; }
  function toLogin() {
    var next = page + location.search + location.hash, top_ = window;
    try { if (window.top !== window && window.top.location.origin === location.origin) { top_ = window.top; next = ''; } } catch (e) {}
    top_.location.replace('login.html' + (next && page !== 'index.html' ? '?next=' + encodeURIComponent(next) : ''));
  }

  var A = window.SentireAuth = {
    enabled: !!(URL_ && KEY), user: null, client: null, ready: Promise.resolve(null),
    // Call a database function; gives its result, or throws an Error with a plain message.
    rpc: function (fn, args) {
      if (!A.client) return Promise.reject(new Error('Could not reach the login service. Check the internet and try again.'));
      return A.client.rpc(fn, args || {}).then(function (r) {
        if (r.error) { var e = new Error(r.error.message || 'Something went wrong.'); e.code = r.error.code; throw e; }
        return r.data;
      });
    },
    remember: function (u) { remember(u); A.user = u; },
    // Rights: may this person open this app page? The Admin, and a user with no list, may open everything.
    can: function (file) {
      var u = A.user;
      if (!A.enabled || !u || u.role === 'Admin' || !Array.isArray(u.apps)) return true;
      return u.apps.indexOf(file) >= 0;
    },
    // Who may delete / approve. The Admin always may; others only when the Admin ticked it for them (Users page).
    canDelete: function () { var u = A.user; return !A.enabled || !u || u.role === 'Admin' || u.can_delete === true; },
    // Accounts (ACS): may see order rates and bill details. The Admin always may.
    canBill: function () { var u = A.user; return !A.enabled || !u || u.role === 'Admin' || u.can_bill === true; },
    canApprove: function () { var u = A.user; return !A.enabled || !u || u.role === 'Admin' || u.can_approve === true; },
    // Main Page: drop the apps this person may not open from its app list.
    filterApps: function (list) { for (var i = list.length - 1; i >= 0; i--) if (!A.can(list[i].file)) list.splice(i, 1); return list; },
    // Check an Admin's login ID + password WITHOUT changing who is logged in here (used for override approvals).
    verifyAdmin: function (loginId, password) {
      if (!A.enabled || !window.supabase || !window.supabase.createClient) return Promise.reject(new Error('Could not reach the login service.'));
      var c = window.supabase.createClient(URL_, KEY, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false, storageKey: 'sentire-verify' } });
      var bye = function () { try { c.auth.signOut({ scope: 'local' }); } catch (e) {} };
      return c.rpc('login_email', { p_login_id: String(loginId || '').trim().toLowerCase() }).then(function (r) {
        if (r.error || !r.data) throw new Error('Wrong Admin login ID or password.');
        return c.auth.signInWithPassword({ email: r.data, password: password });
      }).then(function (r) {
        if (r.error) throw new Error('Wrong Admin login ID or password.');
        return c.rpc('my_profile');
      }).then(function (r) {
        var p = r && r.data; bye();
        if (!p || p.role !== 'Admin') throw new Error('That login is not an Admin.');
        return p.name || 'Admin';
      }, function (e) { bye(); throw e; });
    },
    logout: function () {
      var done = function () { forget(); toLogin(); };
      if (A.client) A.client.auth.signOut().then(done, done); else done();
    }
  };
  if (!A.enabled) return;                         // login is switched off (auth_config.js is empty)
  if (window.supabase && window.supabase.createClient) A.client = window.supabase.createClient(URL_, KEY);
  if (isLogin) return;                            // the login page does its own work

  var u = cached();
  if (u) A.user = u; else hide();

  // An app page this person has no right to open is covered with a notice.
  var OPEN_TO_ALL = { 'index.html': 1, 'users.html': 1, 'hub.html': 1, '': 1 }, blocked = false;
  function checkRight() {
    if (blocked || OPEN_TO_ALL[page] || A.can(page)) return;
    blocked = true;
    var put = function () {
      var d = document.createElement('div');
      d.style.cssText = 'position:fixed;inset:0;z-index:2147483647;background:#0c0f14;color:#e8ecf4;font-family:sans-serif;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;padding:24px;text-align:center;';
      d.innerHTML = '<div style="font-size:18px;font-weight:600">You do not have access to this app</div><div style="font-size:13px;color:#7a8599">Ask the Admin if you need it.</div>' +
        (window.top === window ? '<a href="index.html" style="color:#3b82f6;font-size:14px">← Main Page</a>' : '');
      document.body.innerHTML = ''; document.body.appendChild(d);
    };
    if (document.body) put(); else document.addEventListener('DOMContentLoaded', put);
  }
  if (u) checkRight();

  if (!A.client) {                                // the Supabase library did not load (no internet)
    if (!u) toLogin();
    A.ready = Promise.resolve(u);
  } else {
    A.ready = A.client.auth.getSession().then(function (r) {
      if (!(r.data && r.data.session)) { forget(); toLogin(); return null; }
      return A.rpc('my_profile').then(function (p) {
        if (!p) { A.logout(); return null; }       // login was removed by the Admin
        A.remember(p); checkRight(); show(); return p;
      });
    }).catch(function () {                        // no internet: carry on if this device was logged in
      if (u) { show(); return u; }
      toLogin(); return null;
    });
  }

  // Main Page: show who is logged in, with Users (Admin only) and Log out.
  if (page === 'index.html') {
    var dom = new Promise(function (res) { if (document.readyState !== 'loading') res(); else document.addEventListener('DOMContentLoaded', res); });
    Promise.all([A.ready, dom]).then(function (v) {
      var me = v[0], bar = document.querySelector('.topbar'); if (!me || !bar) return;
      function btn(text, fn) { var b = document.createElement('button'); b.className = 'tb-btn show'; b.textContent = text; b.onclick = fn; bar.appendChild(b); }
      var who = document.createElement('span');
      who.style.cssText = 'font-size:12px;color:var(--text-dim);margin-left:6px;white-space:nowrap;';
      who.textContent = '👤 ' + me.name + (me.role === 'Admin' ? ' (Admin)' : me.can_bill ? ' (Accounts)' : me.can_delete && me.can_approve ? ' (Sub Admin)' : me.can_approve ? ' (Approver)' : '');
      bar.appendChild(who);
      if (me.role === 'Admin') btn('Users', function () { location.href = 'users.html'; });
      btn('Log out', A.logout);
    });
  }
})();
