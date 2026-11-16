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

  if (!A.client) {                                // the Supabase library did not load (no internet)
    if (!u) toLogin();
    A.ready = Promise.resolve(u);
  } else {
    A.ready = A.client.auth.getSession().then(function (r) {
      if (!(r.data && r.data.session)) { forget(); toLogin(); return null; }
      return A.rpc('my_profile').then(function (p) {
        if (!p) { A.logout(); return null; }       // login was removed by the Admin
        A.remember(p); show(); return p;
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
      who.textContent = '👤 ' + me.name + (me.role === 'Admin' ? ' (Admin)' : '');
      bar.appendChild(who);
      if (me.role === 'Admin') btn('Users', function () { location.href = 'users.html'; });
      btn('Log out', A.logout);
    });
  }
})();
